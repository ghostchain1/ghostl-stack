import express from 'express';
import { createHmac, timingSafeEqual, randomUUID } from 'node:crypto';
import { connect, type NatsConnection, StringCodec } from 'nats';

type Layer = 'L0' | 'L1' | 'L2' | 'L3';

type Envelope = {
  request_id: string;
  timestamp: string;
  ttl_ms: number;
  nonce: string;
  sender: {
    id: string;
    role: string;
    layer_scope: Layer;
  };
  policy: {
    policy_version?: string;
    policy_checkpoint_hash?: string;
    manual_only?: boolean;
    emergency_lock?: boolean;
  };
  payload: Record<string, unknown>;
  signature?: {
    alg?: string;
    kid?: string;
    value?: string;
  };
};

const AGENT_ID           = 'host-orchestrator-ai';
const NATS_URL            = process.env.NATS_URL ?? 'nats://nats:4222';
const GHOSTBRAIN_ENABLED  = String(process.env.GHOSTBRAIN_ENABLED ?? '1') !== '0';

// ──────────────────────────────────────────────────────────────────────────
// GhostBrain Core NATS integration
// ──────────────────────────────────────────────────────────────────────────
const sc = StringCodec();
let _nc: NatsConnection | null = null;

function _brainEnvelope<T>(subject: string, payload: T): string {
  return JSON.stringify({
    messageId: randomUUID(),
    subject,
    correlationId: randomUUID(),
    senderAgentId: AGENT_ID,
    payload,
    sentAt: new Date().toISOString(),
  });
}

function _brainPublish<T>(subject: string, payload: T): void {
  if (!_nc) return;
  _nc.publish(subject, sc.encode(_brainEnvelope(subject, payload)));
}

async function connectGhostBrain(): Promise<void> {
  if (!GHOSTBRAIN_ENABLED) return;
  try {
    _nc = await connect({ servers: NATS_URL, reconnect: true, maxReconnectAttempts: -1 });
    console.log(`[host-orchestrator-ai] GhostBrain NATS connected → ${NATS_URL}`);

    // Register agent
    const now = new Date().toISOString();
    _brainPublish('ghostbrain.agent.register', {
      agentId: AGENT_ID,
      role: 'executor',
      capabilities: [
        'libvirt.status', 'libvirt.start', 'libvirt.stop', 'libvirt.snapshot',
        'docker.ps', 'docker.restart',
        'network.firewall.read',
      ],
      resourceScopes: [
        { type: 'vm', name: '*', layer: 'L1' },
        { type: 'vm', name: '*', layer: 'L2' },
        { type: 'vm', name: '*', layer: 'L3' },
        { type: 'stack', name: 'hypervisor-host', layer: 'L1' },
      ],
      natsSubject: `ghostbrain.agent.${AGENT_ID}.task`,
      registeredAt: now,
      lastSeen: now,
      healthy: true,
    });

    // Subscribe to inbound task assignments
    const taskSub = _nc.subscribe(`ghostbrain.agent.${AGENT_ID}.task`);
    void (async () => {
      for await (const m of taskSub) {
        try {
          const msg = JSON.parse(sc.decode(m.data)) as { correlationId: string; payload: unknown };
          console.log(`[host-orchestrator-ai] GhostBrain task: ${JSON.stringify(msg.payload)}`);
          // Acknowledge — real execution would dispatch to virsh/docker
          _brainPublish(`ghostbrain.agent.${AGENT_ID}.report`, {
            correlationId: msg.correlationId,
            result: { status: 'acknowledged' },
            reportedAt: new Date().toISOString(),
          });
        } catch (err) {
          console.error('[host-orchestrator-ai] Task parse error:', err);
        }
      }
    })();

    // Heartbeat every 60 s
    setInterval(() => {
      _brainPublish('ghostbrain.signal.health', {
        signalId: randomUUID(),
        source: 'manual',
        service: AGENT_ID,
        layer: 'L1',
        metric: 'agent.alive',
        value: 1,
        observedAt: new Date().toISOString(),
        anomaly: false,
      });
    }, 60_000);
  } catch (err) {
    console.warn(`[host-orchestrator-ai] GhostBrain NATS unavailable: ${String(err)}`);
  }
}

const port = Number(process.env.HOST_ORCH_PORT || process.env.PORT || 7831);
const signatureRequired = String(process.env.CONTROL_PLANE_REQUIRE_SIGNATURE || '1') !== '0';
const hmacSecret = process.env.CONTROL_PLANE_HMAC_SECRET || 'dev-control-plane-secret';
const nonceTtlMs = Math.max(10_000, Number(process.env.CONTROL_NONCE_TTL_MS || 300_000));
const allowedVmRoles = String(process.env.HOST_ORCH_ALLOWED_VM_ROLES || 'vm_protocol_ai')
  .split(',')
  .map((value) => value.trim())
  .filter(Boolean);
const allowedHostRoles = String(process.env.HOST_ORCH_ALLOWED_HOST_ROLES || 'host_infra_ai')
  .split(',')
  .map((value) => value.trim())
  .filter(Boolean);

const metrics = {
  actionsProposed: 0,
  actionsExecuted: 0,
  telemetryReports: 0,
  evidenceSubmissions: 0,
  authFailures: 0,
  policyDenials: 0
};

const nonceCache = new Map<string, number>();
const actions = new Map<string, { status: 'proposed' | 'executed'; payload: Record<string, unknown>; createdAt: string }>();

setInterval(() => {
  const now = Date.now();
  for (const [nonce, expiresAt] of nonceCache.entries()) {
    if (expiresAt <= now) nonceCache.delete(nonce);
  }
}, 30_000).unref();

const isAllowedRole = (role: string, allowed: string[]) => allowed.includes(role);

const normalizeLayer = (value: unknown): Layer => {
  const raw = String(value || '').trim().toUpperCase();
  if (raw === 'L0' || raw === '0') return 'L0';
  if (raw === 'L1' || raw === '1') return 'L1';
  if (raw === 'L2' || raw === '2') return 'L2';
  if (raw === 'L3' || raw === '3') return 'L3';
  throw new Error(`invalid_layer:${String(value)}`);
};

const assertRoutingLaw = (sourceLayer: Layer, targetLayer: Layer, externalEgress: boolean) => {
  if (sourceLayer === 'L3' && targetLayer === 'L1') throw new Error('ROUTE_LAW_VIOLATION:l3_l1_bypass_blocked');
  if (externalEgress && sourceLayer !== 'L1') throw new Error('ROUTE_LAW_VIOLATION:external_egress_non_l1_blocked');
};

const canonicalizeEnvelope = (envelope: Envelope) =>
  JSON.stringify({
    request_id: envelope.request_id,
    timestamp: envelope.timestamp,
    ttl_ms: envelope.ttl_ms,
    nonce: envelope.nonce,
    sender: envelope.sender,
    policy: envelope.policy,
    payload: envelope.payload
  });

const verifySignature = (envelope: Envelope) => {
  const provided = String(envelope.signature?.value || '').trim();
  if (!provided) {
    if (signatureRequired) throw new Error('AUTH_INVALID_SIGNATURE:missing_signature');
    return;
  }
  const expected = createHmac('sha256', hmacSecret).update(canonicalizeEnvelope(envelope)).digest('hex');
  const providedBuf = Buffer.from(provided, 'hex');
  const expectedBuf = Buffer.from(expected, 'hex');
  if (providedBuf.length !== expectedBuf.length || !timingSafeEqual(providedBuf, expectedBuf)) {
    throw new Error('AUTH_INVALID_SIGNATURE:mismatch');
  }
};

const verifyFreshness = (envelope: Envelope) => {
  const ts = Date.parse(envelope.timestamp);
  if (!Number.isFinite(ts)) throw new Error('AUTH_EXPIRED_REQUEST:invalid_timestamp');
  const now = Date.now();
  const ttl = Math.max(1_000, Number(envelope.ttl_ms || 0));
  if (Math.abs(now - ts) > ttl) throw new Error('AUTH_EXPIRED_REQUEST:ttl_exceeded');
};

const verifyNonce = (envelope: Envelope) => {
  const nonce = String(envelope.nonce || '').trim();
  if (!nonce) throw new Error('AUTH_REPLAY_NONCE:missing_nonce');
  if (nonceCache.has(nonce)) throw new Error('AUTH_REPLAY_NONCE:duplicate_nonce');
  nonceCache.set(nonce, Date.now() + nonceTtlMs);
};

const parseEnvelope = (body: unknown): Envelope => {
  if (!body || typeof body !== 'object') throw new Error('invalid_envelope');
  const envelope = body as Envelope;
  if (!envelope.request_id || !envelope.timestamp || !envelope.nonce || !envelope.sender || !envelope.payload) {
    throw new Error('invalid_envelope_required_fields');
  }
  return envelope;
};

const validateEnvelope = (envelope: Envelope, allowedRoles: string[]) => {
  verifyFreshness(envelope);
  verifyNonce(envelope);
  verifySignature(envelope);
  if (!isAllowedRole(envelope.sender.role, allowedRoles)) {
    throw new Error(`AUTH_ROLE_DENIED:${envelope.sender.role}`);
  }
  if (envelope.policy?.emergency_lock) throw new Error('EMERGENCY_LOCK_ACTIVE');
};

const app = express();
app.use(express.json({ limit: '512kb' }));

app.get('/v1/host/health', (_req, res) => {
  res.json({ ok: true, service: 'host-orchestrator-ai', signatureRequired, nonceCacheSize: nonceCache.size });
});

app.get('/v1/host/metrics', (_req, res) => {
  res.type('text/plain').send([
    `host_orch_actions_proposed_total ${metrics.actionsProposed}`,
    `host_orch_actions_executed_total ${metrics.actionsExecuted}`,
    `host_orch_telemetry_reports_total ${metrics.telemetryReports}`,
    `host_orch_evidence_submissions_total ${metrics.evidenceSubmissions}`,
    `host_orch_auth_failures_total ${metrics.authFailures}`,
    `host_orch_policy_denials_total ${metrics.policyDenials}`
  ].join('\n'));
});

app.post('/v1/host/actions/propose', (req, res) => {
  try {
    const envelope = parseEnvelope(req.body);
    validateEnvelope(envelope, allowedHostRoles);
    const sourceLayer = normalizeLayer(envelope.payload.source_layer || 'L1');
    const targetLayer = normalizeLayer(envelope.payload.target_layer || 'L2');
    const externalEgress = Boolean(envelope.payload.external_egress || false);
    assertRoutingLaw(sourceLayer, targetLayer, externalEgress);
    actions.set(envelope.request_id, { status: 'proposed', payload: envelope.payload, createdAt: new Date().toISOString() });
    metrics.actionsProposed += 1;
    res.json({ ok: true, action_id: envelope.request_id, status: 'proposed' });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.startsWith('AUTH_')) metrics.authFailures += 1;
    if (message.startsWith('ROUTE_LAW_VIOLATION') || message.includes('EMERGENCY_LOCK_ACTIVE')) metrics.policyDenials += 1;
    res.status(400).json({ ok: false, error: { code: message.split(':')[0], message, retryable: false } });
  }
});

app.post('/v1/host/actions/execute', (req, res) => {
  try {
    const envelope = parseEnvelope(req.body);
    validateEnvelope(envelope, allowedHostRoles);
    if (envelope.policy?.manual_only) throw new Error('MANUAL_ONLY_ACTIVE');
    const actionId = String(envelope.payload.action_id || '').trim();
    if (!actionId || !actions.has(actionId)) throw new Error('ACTION_NOT_FOUND');
    const sourceLayer = normalizeLayer(envelope.payload.source_layer || 'L1');
    const targetLayer = normalizeLayer(envelope.payload.target_layer || 'L2');
    const externalEgress = Boolean(envelope.payload.external_egress || false);
    assertRoutingLaw(sourceLayer, targetLayer, externalEgress);
    actions.set(actionId, {
      status: 'executed',
      payload: { ...actions.get(actionId)?.payload, executed_at: new Date().toISOString() },
      createdAt: actions.get(actionId)?.createdAt || new Date().toISOString()
    });
    metrics.actionsExecuted += 1;
    res.json({ ok: true, action_id: actionId, status: 'executed' });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.startsWith('AUTH_')) metrics.authFailures += 1;
    if (message.startsWith('ROUTE_LAW_VIOLATION') || message.includes('MANUAL_ONLY_ACTIVE') || message.includes('EMERGENCY_LOCK_ACTIVE')) {
      metrics.policyDenials += 1;
    }
    res.status(400).json({ ok: false, error: { code: message.split(':')[0], message, retryable: false } });
  }
});

app.post('/v1/host/telemetry/report', (req, res) => {
  try {
    const envelope = parseEnvelope(req.body);
    validateEnvelope(envelope, allowedVmRoles);
    metrics.telemetryReports += 1;
    // Forward telemetry as a health signal to GhostBrain
    _brainPublish('ghostbrain.signal.health', {
      signalId: randomUUID(),
      source: 'nats',
      service: String(envelope.sender.id || AGENT_ID),
      layer: envelope.sender.layer_scope === 'L0' ? 'L1' : envelope.sender.layer_scope as Layer,
      logLine: `Telemetry from ${envelope.sender.id}: ${JSON.stringify(envelope.payload).slice(0, 120)}`,
      observedAt: envelope.timestamp,
      anomaly: false,
    });
    res.json({ ok: true, accepted_at: new Date().toISOString(), request_id: envelope.request_id });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.startsWith('AUTH_')) metrics.authFailures += 1;
    res.status(400).json({ ok: false, error: { code: message.split(':')[0], message, retryable: false } });
  }
});

app.post('/v1/host/evidence/submit', (req, res) => {
  try {
    const envelope = parseEnvelope(req.body);
    validateEnvelope(envelope, allowedVmRoles);
    metrics.evidenceSubmissions += 1;
    res.json({ ok: true, accepted_at: new Date().toISOString(), request_id: envelope.request_id });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.startsWith('AUTH_')) metrics.authFailures += 1;
    res.status(400).json({ ok: false, error: { code: message.split(':')[0], message, retryable: false } });
  }
});

app.listen(port, '0.0.0.0', () => {
  console.log(`[host-orchestrator-ai] listening on :${port}`);
  void connectGhostBrain();
});

process.on('SIGTERM', async () => { if (_nc) await _nc.drain(); process.exit(0); });
process.on('SIGINT',  async () => { if (_nc) await _nc.drain(); process.exit(0); });
