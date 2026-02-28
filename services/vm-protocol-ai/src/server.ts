import express from 'express';
import { createHmac, timingSafeEqual } from 'node:crypto';

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

const port = Number(process.env.VM_PROTOCOL_PORT || process.env.PORT || 7832);
const signatureRequired = String(process.env.CONTROL_PLANE_REQUIRE_SIGNATURE || '1') !== '0';
const hmacSecret = process.env.CONTROL_PLANE_HMAC_SECRET || 'dev-control-plane-secret';
const nonceTtlMs = Math.max(10_000, Number(process.env.CONTROL_NONCE_TTL_MS || 300_000));
const manualOnlyDefault = String(process.env.VM_PROTOCOL_MANUAL_ONLY || '0') === '1';
const emergencyLockDefault = String(process.env.VM_PROTOCOL_EMERGENCY_LOCK || '0') === '1';
const allowedHostRoles = String(process.env.VM_PROTOCOL_ALLOWED_HOST_ROLES || 'host_infra_ai')
  .split(',')
  .map((value) => value.trim())
  .filter(Boolean);

const metrics = {
  evaluations: 0,
  applies: 0,
  denied: 0,
  authFailures: 0
};

const nonceCache = new Map<string, number>();

setInterval(() => {
  const now = Date.now();
  for (const [nonce, expiresAt] of nonceCache.entries()) {
    if (expiresAt <= now) nonceCache.delete(nonce);
  }
}, 30_000).unref();

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
  const ttl = Math.max(1_000, Number(envelope.ttl_ms || 0));
  if (Math.abs(Date.now() - ts) > ttl) throw new Error('AUTH_EXPIRED_REQUEST:ttl_exceeded');
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

const validateEnvelope = (envelope: Envelope) => {
  verifyFreshness(envelope);
  verifyNonce(envelope);
  verifySignature(envelope);
  if (!allowedHostRoles.includes(envelope.sender.role)) {
    throw new Error(`AUTH_ROLE_DENIED:${envelope.sender.role}`);
  }
};

const effectiveManualOnly = (envelope: Envelope) => manualOnlyDefault || Boolean(envelope.policy?.manual_only);
const effectiveEmergencyLock = (envelope: Envelope) => emergencyLockDefault || Boolean(envelope.policy?.emergency_lock);

const app = express();
app.use(express.json({ limit: '512kb' }));

app.get('/v1/vm/health', (_req, res) => {
  res.json({
    ok: true,
    service: 'vm-protocol-ai',
    signatureRequired,
    manualOnlyDefault,
    emergencyLockDefault,
    nonceCacheSize: nonceCache.size
  });
});

app.get('/v1/vm/metrics', (_req, res) => {
  res.type('text/plain').send([
    `vm_protocol_evaluations_total ${metrics.evaluations}`,
    `vm_protocol_applies_total ${metrics.applies}`,
    `vm_protocol_denied_total ${metrics.denied}`,
    `vm_protocol_auth_failures_total ${metrics.authFailures}`
  ].join('\n'));
});

app.post('/v1/vm/actions/evaluate', (req, res) => {
  try {
    const envelope = parseEnvelope(req.body);
    validateEnvelope(envelope);
    const sourceLayer = normalizeLayer(envelope.payload.source_layer || 'L1');
    const targetLayer = normalizeLayer(envelope.payload.target_layer || 'L2');
    const externalEgress = Boolean(envelope.payload.external_egress || false);
    assertRoutingLaw(sourceLayer, targetLayer, externalEgress);
    const decision = {
      allow: true,
      reason: 'within_policy_bounds',
      requires_governance: false,
      required_approvals: 0,
      risk_score: 0.25
    };
    if (effectiveEmergencyLock(envelope)) {
      decision.allow = false;
      decision.reason = 'emergency_lock_active';
      decision.requires_governance = false;
      decision.required_approvals = 0;
    }
    metrics.evaluations += 1;
    if (!decision.allow) metrics.denied += 1;
    res.json({ ok: true, decision });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.startsWith('AUTH_')) metrics.authFailures += 1;
    metrics.denied += 1;
    res.status(400).json({ ok: false, error: { code: message.split(':')[0], message, retryable: false } });
  }
});

app.post('/v1/vm/actions/apply', (req, res) => {
  try {
    const envelope = parseEnvelope(req.body);
    validateEnvelope(envelope);

    if (effectiveEmergencyLock(envelope)) throw new Error('EMERGENCY_LOCK_ACTIVE');
    if (effectiveManualOnly(envelope)) throw new Error('MANUAL_ONLY_ACTIVE');

    const actionType = String(envelope.payload.action_type || '').trim().toLowerCase();
    const sourceLayer = normalizeLayer(envelope.payload.source_layer || 'L1');
    const targetLayer = normalizeLayer(envelope.payload.target_layer || 'L2');
    const externalEgress = Boolean(envelope.payload.external_egress || false);
    assertRoutingLaw(sourceLayer, targetLayer, externalEgress);

    if (actionType !== 'observe' && !envelope.policy?.policy_checkpoint_hash) {
      throw new Error('POLICY_CHECKPOINT_MISSING');
    }

    metrics.applies += 1;
    res.json({
      ok: true,
      status: 'applied',
      applied_at: new Date().toISOString(),
      evidence_id: `vm-evidence-${envelope.request_id}`
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.startsWith('AUTH_')) metrics.authFailures += 1;
    metrics.denied += 1;
    res.status(400).json({ ok: false, error: { code: message.split(':')[0], message, retryable: false } });
  }
});

app.listen(port, '0.0.0.0', () => {
  console.log(`[vm-protocol-ai] listening on :${port}`);
});
