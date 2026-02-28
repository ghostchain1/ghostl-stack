import express from 'express';
import { createHash, createHmac, randomUUID } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';

type Layer = 'L1' | 'L2' | 'L3';

type Decision = {
  allow: boolean;
  reason: string;
  action: string;
  requestLayer: Layer;
  recordLayer: Layer;
  confidence: number;
  evaluatedAt: string;
};

type EvidenceEnvelope = {
  id: string;
  createdAt: string;
  record: {
    domain: string;
    target: string;
    layer: Layer;
    ttl: number;
    version: number;
  };
  decision: Decision;
  decisionHash: string;
  signature: string;
};

const port = Number(process.env.PORT || 7814);
const policyUrl = process.env.GHOSTDNS_POLICY_URL || 'http://ghostdns-ai-policy:7813';
const evidenceDir = process.env.EVIDENCE_DIR || '/data/evidence';
const attestorSecret = process.env.ATTESTOR_SECRET || 'ghostdns-dev-attestor';
const adminToken = String(process.env.ADMIN_TOKEN || '').trim();

const metrics = {
  attestations: 0,
  denied: 0,
  errors: 0
};

const toLayer = (value: unknown): Layer => {
  const raw = String(value || '').trim().toUpperCase();
  if (raw === '1' || raw === 'L1') return 'L1';
  if (raw === '2' || raw === 'L2') return 'L2';
  if (raw === '3' || raw === 'L3') return 'L3';
  throw new Error(`invalid_layer:${String(value)}`);
};

const ensureAdmin = (req: express.Request, res: express.Response, next: express.NextFunction) => {
  if (!adminToken) return next();
  const provided = String(req.header('authorization') || '').replace(/^Bearer\s+/i, '');
  if (provided !== adminToken) {
    res.status(401).json({ ok: false, error: 'unauthorized' });
    return;
  }
  next();
};

const decisionHash = (decision: Decision) => createHash('sha256').update(JSON.stringify(decision)).digest('hex');

const signEnvelope = (payload: object) => createHmac('sha256', attestorSecret).update(JSON.stringify(payload)).digest('hex');

const storeEvidence = async (envelope: EvidenceEnvelope) => {
  await fs.mkdir(evidenceDir, { recursive: true });
  const filePath = path.join(evidenceDir, `${envelope.id}.json`);
  await fs.writeFile(filePath, JSON.stringify(envelope, null, 2), 'utf8');
  return filePath;
};

const evaluatePolicy = async (action: string, requestLayer: Layer, recordLayer: Layer, confidence: number) => {
  const response = await fetch(`${policyUrl}/v1/policy/evaluate`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ action, requestLayer, recordLayer, confidence })
  });
  if (!response.ok) throw new Error(`policy_http_${response.status}`);
  const body = (await response.json()) as { decision: Decision };
  return body.decision;
};

const app = express();
app.use(express.json({ limit: '512kb' }));

app.get('/health', (_req, res) => {
  res.json({ ok: true, service: 'ghostdns-attestor', evidenceDir });
});

app.get('/metrics', (_req, res) => {
  res.type('text/plain').send([
    `ghostdns_attestor_attestations_total ${metrics.attestations}`,
    `ghostdns_attestor_denied_total ${metrics.denied}`,
    `ghostdns_attestor_errors_total ${metrics.errors}`
  ].join('\n'));
});

app.post('/v1/attest', ensureAdmin, async (req, res) => {
  try {
    const domain = String(req.body?.domain || '').trim().toLowerCase();
    const target = String(req.body?.target || '').trim();
    if (!domain || !target) {
      res.status(400).json({ ok: false, error: 'domain_and_target_required' });
      return;
    }
    const recordLayer = toLayer(req.body?.recordLayer || 'L1');
    const requestLayer = toLayer(req.body?.requestLayer || 'L1');
    const confidence = Math.max(0, Math.min(1, Number(req.body?.confidence ?? 0.85)));
    const ttl = Math.max(10, Math.min(86_400, Number(req.body?.ttl || 300)));
    const version = Math.max(1, Number(req.body?.version || 1));

    const decision = await evaluatePolicy('resolve', requestLayer, recordLayer, confidence);
    if (!decision.allow) {
      metrics.denied += 1;
      res.status(403).json({ ok: false, error: 'policy_denied', decision });
      return;
    }

    const hash = decisionHash(decision);
    const envelope: EvidenceEnvelope = {
      id: `ghostdns-${randomUUID()}`,
      createdAt: new Date().toISOString(),
      record: {
        domain,
        target,
        layer: recordLayer,
        ttl,
        version
      },
      decision,
      decisionHash: hash,
      signature: ''
    };
    envelope.signature = signEnvelope({
      id: envelope.id,
      createdAt: envelope.createdAt,
      decisionHash: envelope.decisionHash,
      domain: envelope.record.domain,
      target: envelope.record.target
    });

    const filePath = await storeEvidence(envelope);
    metrics.attestations += 1;

    res.json({
      ok: true,
      evidenceId: envelope.id,
      decisionHash: envelope.decisionHash,
      filePath,
      signature: envelope.signature
    });
  } catch (error: unknown) {
    metrics.errors += 1;
    res.status(500).json({ ok: false, error: error instanceof Error ? error.message : String(error) });
  }
});

app.listen(port, '0.0.0.0', () => {
  console.log(`[ghostdns-attestor] listening on :${port}`);
});
