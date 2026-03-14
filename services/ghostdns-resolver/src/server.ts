import express from 'express';
import { createHash } from 'node:crypto';

type Layer = 'L1' | 'L2' | 'L3';

type GhostDnsRecord = {
  domain: string;
  target: string;
  layer: Layer;
  ttl: number;
  version: number;
  owner: string | null;
  updatedAt: string;
  source: 'onchain' | 'manual';
  txHash?: string;
};

const port = Number(process.env.PORT || 7812);
const indexerUrl = process.env.GHOSTDNS_INDEXER_URL || 'http://ghostdns-indexer:7811';
const policyUrl = process.env.GHOSTDNS_POLICY_URL || 'http://ghostdns-ai-policy:7813';
const strictPolicy = String(process.env.GHOSTDNS_POLICY_REQUIRED || '1') !== '0';

const metrics = {
  resolveRequests: 0,
  resolveDenied: 0,
  resolveMisses: 0,
  policyErrors: 0
};

const normalizeLayer = (value: unknown): Layer => {
  const raw = String(value || '').trim().toUpperCase();
  if (raw === 'L1' || raw === '1') return 'L1';
  if (raw === 'L2' || raw === '2') return 'L2';
  if (raw === 'L3' || raw === '3') return 'L3';
  throw new Error(`invalid_layer:${String(value)}`);
};

const normalizeDomain = (value: unknown) => {
  const domain = String(value || '').trim().toLowerCase();
  if (!domain) throw new Error('domain_required');
  return domain;
};

const assertResolutionLayer = (requestLayer: Layer, recordLayer: Layer) => {
  if (requestLayer === recordLayer) return;
  if (requestLayer === 'L1') return;
  if (requestLayer === 'L2' && recordLayer === 'L3') return;
  throw new Error(`ghostdns_resolution_blocked:${requestLayer}->${recordLayer}`);
};

const loadRecord = async (domain: string): Promise<GhostDnsRecord | null> => {
  const res = await fetch(`${indexerUrl}/v1/records/${encodeURIComponent(domain)}`);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`indexer_http_${res.status}`);
  const body = (await res.json()) as { record?: GhostDnsRecord };
  return body.record || null;
};

const evaluatePolicy = async (requestLayer: Layer, recordLayer: Layer) => {
  const response = await fetch(`${policyUrl}/v1/policy/evaluate`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ action: 'resolve', requestLayer, recordLayer })
  });
  if (!response.ok) throw new Error(`policy_http_${response.status}`);
  return (await response.json()) as { ok: boolean; decision: { allow: boolean; reason: string; confidence: number } };
};

const app = express();
app.use(express.json({ limit: '256kb' }));

app.get('/health', (_req, res) => {
  res.json({ ok: true, service: 'ghostdns-resolver', strictPolicy });
});

app.get('/metrics', (_req, res) => {
  res.type('text/plain').send([
    `ghostdns_resolver_requests_total ${metrics.resolveRequests}`,
    `ghostdns_resolver_denied_total ${metrics.resolveDenied}`,
    `ghostdns_resolver_misses_total ${metrics.resolveMisses}`,
    `ghostdns_resolver_policy_errors_total ${metrics.policyErrors}`
  ].join('\n'));
});

app.get('/v1/resolve/:domain', async (req, res) => {
  metrics.resolveRequests += 1;
  let requestLayer: Layer = 'L1';
  try {
    requestLayer = normalizeLayer(req.query.layer || 'L1');
    const domain = normalizeDomain(req.params.domain);
    const record = await loadRecord(domain);
    if (!record) {
      metrics.resolveMisses += 1;
      res.status(404).json({ ok: false, error: 'record_not_found' });
      return;
    }

    assertResolutionLayer(requestLayer, record.layer);

    let decision = {
      allow: true,
      reason: 'local_guard_allow',
      confidence: 1
    };
    try {
      const policy = await evaluatePolicy(requestLayer, record.layer);
      decision = policy.decision;
    } catch {
      metrics.policyErrors += 1;
      if (strictPolicy) {
        metrics.resolveDenied += 1;
        res.status(503).json({ ok: false, error: 'policy_unavailable' });
        return;
      }
    }

    if (!decision.allow) {
      metrics.resolveDenied += 1;
      res.status(403).json({ ok: false, error: 'resolution_denied', decision });
      return;
    }

    const digest = createHash('sha256').update(JSON.stringify({ record, decision })).digest('hex');
    res.json({
      ok: true,
      domain,
      answer: record.target,
      ttl: record.ttl,
      layer: record.layer,
      version: record.version,
      policy: decision,
      evidenceHash: digest
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.startsWith('ghostdns_resolution_blocked')) {
      metrics.resolveDenied += 1;
      res.status(403).json({ ok: false, error: message, requestLayer });
      return;
    }
    res.status(400).json({ ok: false, error: message });
  }
});

app.listen(port, '0.0.0.0', () => {
  console.log(`[ghostdns-resolver] listening on :${port}`);
});
