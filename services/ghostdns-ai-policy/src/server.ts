import express from 'express';
import { createHash } from 'node:crypto';

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

const port = Number(process.env.PORT || 7813);
const policyVersion = process.env.GHOSTDNS_POLICY_VERSION || 'v1';
const emergencyLock = String(process.env.GHOSTDNS_EMERGENCY_LOCK || '0') === '1';
const confidenceFloor = Math.max(0, Math.min(1, Number(process.env.GHOSTDNS_CONFIDENCE_FLOOR || 0.55)));

const metrics = {
  evaluations: 0,
  denied: 0
};

const toLayer = (value: unknown): Layer => {
  const raw = String(value || '').trim().toUpperCase();
  if (raw === '1' || raw === 'L1') return 'L1';
  if (raw === '2' || raw === 'L2') return 'L2';
  if (raw === '3' || raw === 'L3') return 'L3';
  throw new Error(`invalid_layer:${String(value)}`);
};

const canResolve = (requestLayer: Layer, recordLayer: Layer) => {
  if (requestLayer === recordLayer) return true;
  if (requestLayer === 'L1') return true;
  if (requestLayer === 'L2' && recordLayer === 'L3') return true;
  return false;
};

const canMutate = (requestLayer: Layer) => requestLayer === 'L1';

const evaluate = (input: { action: string; requestLayer: Layer; recordLayer: Layer; confidence?: number }): Decision => {
  const action = String(input.action || '').trim().toLowerCase();
  const requestLayer = input.requestLayer;
  const recordLayer = input.recordLayer;
  const confidence = Math.max(0, Math.min(1, Number(input.confidence ?? 0.8)));

  if (emergencyLock) {
    return {
      allow: false,
      reason: 'emergency_lock',
      action,
      requestLayer,
      recordLayer,
      confidence,
      evaluatedAt: new Date().toISOString()
    };
  }

  if (confidence < confidenceFloor) {
    return {
      allow: false,
      reason: 'confidence_below_floor',
      action,
      requestLayer,
      recordLayer,
      confidence,
      evaluatedAt: new Date().toISOString()
    };
  }

  if (action === 'resolve') {
    return {
      allow: canResolve(requestLayer, recordLayer),
      reason: canResolve(requestLayer, recordLayer) ? 'resolution_allowed' : 'resolution_blocked_by_layer_law',
      action,
      requestLayer,
      recordLayer,
      confidence,
      evaluatedAt: new Date().toISOString()
    };
  }

  if (action === 'mutate') {
    const allowed = canMutate(requestLayer);
    return {
      allow: allowed,
      reason: allowed ? 'mutation_allowed_l1' : 'mutation_blocked_non_l1',
      action,
      requestLayer,
      recordLayer,
      confidence,
      evaluatedAt: new Date().toISOString()
    };
  }

  return {
    allow: false,
    reason: 'unsupported_action',
    action,
    requestLayer,
    recordLayer,
    confidence,
    evaluatedAt: new Date().toISOString()
  };
};

const decisionHash = (decision: Decision) => createHash('sha256').update(JSON.stringify(decision)).digest('hex');

const app = express();
app.use(express.json({ limit: '256kb' }));

app.get('/health', (_req, res) => {
  res.json({ ok: true, service: 'ghostdns-ai-policy', policyVersion, emergencyLock, confidenceFloor });
});

app.get('/metrics', (_req, res) => {
  res.type('text/plain').send([
    `ghostdns_policy_evaluations_total ${metrics.evaluations}`,
    `ghostdns_policy_denied_total ${metrics.denied}`
  ].join('\n'));
});

app.post('/v1/policy/evaluate', (req, res) => {
  try {
    const requestLayer = toLayer(req.body?.requestLayer || 'L1');
    const recordLayer = toLayer(req.body?.recordLayer || requestLayer);
    const action = String(req.body?.action || 'resolve');
    const confidence = Number(req.body?.confidence ?? 0.8);
    const decision = evaluate({ action, requestLayer, recordLayer, confidence });
    metrics.evaluations += 1;
    if (!decision.allow) metrics.denied += 1;
    res.json({ ok: true, policyVersion, decision, decisionHash: decisionHash(decision) });
  } catch (error: unknown) {
    res.status(400).json({ ok: false, error: error instanceof Error ? error.message : String(error) });
  }
});

app.listen(port, '0.0.0.0', () => {
  console.log(`[ghostdns-ai-policy] listening on :${port}`);
});
