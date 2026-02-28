import express from 'express';
import { createHash } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';

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

type State = {
  records: Record<string, GhostDnsRecord>;
  lastSyncAt: string | null;
  sourceBlock: number;
};

const port = Number(process.env.PORT || 7811);
const dataDir = process.env.STATE_DIR || '/data';
const statePath = path.join(dataDir, 'ghostdns-indexer-state.json');
const syncIntervalMs = Math.max(5_000, Number(process.env.SYNC_INTERVAL_MS || 15_000));
const registryUrl = process.env.RPC_REGISTRY_URL || 'http://ghost-registry:8088/v1/endpoints';
const adminToken = String(process.env.ADMIN_TOKEN || '').trim();

const state: State = {
  records: {},
  lastSyncAt: null,
  sourceBlock: 0
};

const metrics = {
  syncRuns: 0,
  syncErrors: 0,
  writes: 0,
  reads: 0
};

const toLayer = (value: unknown): Layer => {
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

const digestRecord = (record: GhostDnsRecord) => createHash('sha256').update(JSON.stringify(record)).digest('hex');

const save = async () => {
  await fs.mkdir(dataDir, { recursive: true });
  await fs.writeFile(statePath, JSON.stringify(state, null, 2), 'utf8');
};

const load = async () => {
  try {
    const raw = await fs.readFile(statePath, 'utf8');
    const parsed = JSON.parse(raw) as State;
    state.records = parsed.records || {};
    state.lastSyncAt = parsed.lastSyncAt || null;
    state.sourceBlock = Number(parsed.sourceBlock || 0);
  } catch {
    // no-op
  }
};

const syncChains = async () => {
  metrics.syncRuns += 1;
  try {
    const res = await fetch(registryUrl);
    if (!res.ok) throw new Error(`registry_http_${res.status}`);
    await res.json();
    state.lastSyncAt = new Date().toISOString();
    await save();
  } catch {
    metrics.syncErrors += 1;
  }
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

const app = express();
app.use(express.json({ limit: '1mb' }));

app.get('/health', (_req, res) => {
  res.json({ ok: true, service: 'ghostdns-indexer', records: Object.keys(state.records).length, lastSyncAt: state.lastSyncAt });
});

app.get('/metrics', (_req, res) => {
  res.type('text/plain').send([
    `ghostdns_indexer_records ${Object.keys(state.records).length}`,
    `ghostdns_indexer_sync_runs_total ${metrics.syncRuns}`,
    `ghostdns_indexer_sync_errors_total ${metrics.syncErrors}`,
    `ghostdns_indexer_reads_total ${metrics.reads}`,
    `ghostdns_indexer_writes_total ${metrics.writes}`
  ].join('\n'));
});

app.get('/v1/records', (req, res) => {
  metrics.reads += 1;
  const layer = req.query.layer ? toLayer(req.query.layer) : null;
  const values = Object.values(state.records).filter((record) => (layer ? record.layer === layer : true));
  res.json({ ok: true, count: values.length, records: values });
});

app.get('/v1/records/:domain', (req, res) => {
  metrics.reads += 1;
  const domain = normalizeDomain(req.params.domain);
  const record = state.records[domain];
  if (!record) {
    res.status(404).json({ ok: false, error: 'record_not_found' });
    return;
  }
  res.json({ ok: true, record, digest: digestRecord(record) });
});

app.post('/v1/records/upsert', ensureAdmin, async (req, res) => {
  const domain = normalizeDomain(req.body?.domain);
  const target = String(req.body?.target || '').trim();
  if (!target) {
    res.status(400).json({ ok: false, error: 'target_required' });
    return;
  }
  const layer = toLayer(req.body?.layer || 'L1');
  const ttl = Math.max(10, Math.min(86_400, Number(req.body?.ttl || 300)));
  const previous = state.records[domain];
  const nextRecord: GhostDnsRecord = {
    domain,
    target,
    layer,
    ttl,
    version: previous ? previous.version + 1 : 1,
    owner: req.body?.owner ? String(req.body.owner) : null,
    updatedAt: new Date().toISOString(),
    source: req.body?.source === 'onchain' ? 'onchain' : 'manual',
    txHash: req.body?.txHash ? String(req.body.txHash) : undefined
  };
  state.records[domain] = nextRecord;
  metrics.writes += 1;
  await save();
  res.json({ ok: true, record: nextRecord, digest: digestRecord(nextRecord) });
});

app.post('/v1/sync/now', ensureAdmin, async (_req, res) => {
  await syncChains();
  res.json({ ok: true, lastSyncAt: state.lastSyncAt });
});

await load();
setInterval(() => {
  void syncChains();
}, syncIntervalMs);

app.listen(port, '0.0.0.0', () => {
  console.log(`[ghostdns-indexer] listening on :${port}`);
});
