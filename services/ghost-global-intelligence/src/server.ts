/**
 * @file src/server.ts
 * Ghost Global Network Intelligence — HTTP server + cron scheduler.
 *
 * Cron: runs topology analysis + scaling evaluation every 60 s.
 *
 * Endpoints:
 *   GET  /health           — health check (k8s probe)
 *   GET  /healthz          — alias
 *   GET  /status           — full GNI status snapshot
 *   GET  /topology         — current topology snapshot
 *   GET  /forecast         — load forecast
 *   GET  /regions          — region distribution + gaps
 *   GET  /latency          — latency report per node
 *   GET  /proposals/recent — last N expansion proposals submitted
 *   GET  /metrics          — Prometheus text
 */

import express, { Request, Response } from 'express';
import cron from 'node-cron';
import { register as promRegister, Counter, Gauge } from 'prom-client';
import { analyzeNetwork } from './topology/networkMap.js';
import { evaluateScaling } from './scaling/nodeScaler.js';
import { evaluateValidatorScaling } from './scaling/validatorScaler.js';
import { runExpansionPlanner, computeForecast, getExpansionCount } from './intelligence/expansionPlanner.js';
import { recordSample } from './intelligence/loadPrediction.js';
import { buildRegionMap } from './regions/geoAnalyzer.js';
import { recordLatencies, getLatencyReport, detectHighLatency } from './regions/latencyMap.js';
import { summarizePeers } from './topology/peerAnalyzer.js';
import type { GniStatus, TopologySnapshot } from './types.js';

// ── Config ────────────────────────────────────────────────────────────────────
const PORT      = parseInt(process.env.GNI_PORT    ?? '7970', 10);
const BIND      = process.env.GNI_BIND             ?? '0.0.0.0';
const CRON_EXPR = process.env.GNI_CRON_EXPR        ?? '*/60 * * * * *'; // every 60 s
const SERVICE_VERSION = '1.0.0';

function log(level: string, msg: string, extra: object = {}) {
  process.stdout.write(
    JSON.stringify({ ts: new Date().toISOString(), level, svc: 'ghost-global-intelligence', msg, ...extra }) + '\n'
  );
}

// ── Prometheus metrics ────────────────────────────────────────────────────────
const cycleCounter    = new Counter({ name: 'gni_cycles_total',       help: 'Total GNI analysis cycles' });
const errorCounter    = new Counter({ name: 'gni_errors_total',       help: 'Total GNI cycle errors' });
const proposalCounter = new Counter({ name: 'gni_proposals_total',    help: 'Total expansion proposals emitted' });
const peerGauge       = new Gauge({   name: 'gni_total_peers',         help: 'Total peers across all nodes' });
const nodeGauge       = new Gauge({   name: 'gni_healthy_nodes',       help: 'Count of healthy nodes' });
const gapGauge        = new Gauge({   name: 'gni_region_gaps',         help: 'Count of regional deficit gaps' });
const latencyGauge    = new Gauge({   name: 'gni_avg_latency_ms',      help: 'Average RPC latency ms' });

// ── State ─────────────────────────────────────────────────────────────────────
let _lastTopology: TopologySnapshot | null = null;
let _startedAt = Date.now();

// ── Ring buffer for recent proposals ─────────────────────────────────────────
const _recentProposals: object[] = [];
const MAX_RECENT = 100;

function trackProposal(p: object) {
  _recentProposals.push(p);
  if (_recentProposals.length > MAX_RECENT) _recentProposals.shift();
  proposalCounter.inc();
}

// ── Main analysis cycle ───────────────────────────────────────────────────────
async function runCycle() {
  cycleCounter.inc();
  const start = Date.now();
  try {
    const topology = await analyzeNetwork();
    _lastTopology  = topology;

    // Update Prometheus gauges
    peerGauge.set(topology.totalPeers);
    nodeGauge.set(topology.nodes.filter(n => n.healthy).length);
    gapGauge.set(topology.gaps.length);

    // Latency tracking
    recordLatencies(topology.nodes);
    const { avgGlobalLatencyMs } = await import('./regions/latencyMap.js');
    latencyGauge.set(avgGlobalLatencyMs());

    // Load prediction feed
    recordSample(topology, 0 /* TPS not yet measured — future: read from L1 */);

    log('info', 'cycle-topology', { summary: summarizePeers(topology) });

    // Scaling evaluations (emit proposals if needed)
    await evaluateScaling(topology);
    await evaluateValidatorScaling(topology);
    await runExpansionPlanner(topology);

    log('info', 'cycle-done', { ms: Date.now() - start, gaps: topology.gaps.length });
  } catch (err) {
    errorCounter.inc();
    log('error', 'cycle-error', { error: err instanceof Error ? err.message : String(err), ms: Date.now() - start });
  }
}

// ── Express app ───────────────────────────────────────────────────────────────
const app = express();

// Security: disable X-Powered-By header
app.disable('x-powered-by');

app.get(['/health', '/healthz'], (_req: Request, res: Response) => {
  res.json({ ok: true, service: 'ghost-global-intelligence', uptime: Math.floor((Date.now() - _startedAt) / 1000) });
});

app.get('/status', (_req: Request, res: Response) => {
  const status: GniStatus = {
    service:      'ghost-global-intelligence',
    version:      SERVICE_VERSION,
    uptime:       Date.now() - _startedAt,
    lastTopology: _lastTopology,
    lastForecast: computeForecast(),
    proposals:    { total: getExpansionCount(), failed: 0 },
  };
  res.json(status);
});

app.get('/topology', (_req: Request, res: Response) => {
  if (!_lastTopology) {
    res.status(503).json({ ok: false, error: 'topology not yet collected' });
    return;
  }
  res.json(_lastTopology);
});

app.get('/forecast', (_req: Request, res: Response) => {
  res.json(computeForecast());
});

app.get('/regions', (_req: Request, res: Response) => {
  const nodes  = _lastTopology?.nodes ?? [];
  const map    = buildRegionMap(nodes);
  const gaps   = _lastTopology?.gaps ?? [];
  res.json({ regions: map, gaps });
});

app.get('/latency', (_req: Request, res: Response) => {
  const report = getLatencyReport();
  const alerts = detectHighLatency();
  res.json({ nodes: report, alerts });
});

app.get('/proposals/recent', (req: Request, res: Response) => {
  const limitRaw = parseInt(req.query['limit'] as string ?? '20', 10);
  const limit    = Number.isFinite(limitRaw) ? Math.max(1, Math.min(100, limitRaw)) : 20;
  res.json({ proposals: _recentProposals.slice(-limit) });
});

app.get('/metrics', async (_req: Request, res: Response) => {
  res.set('Content-Type', promRegister.contentType);
  res.end(await promRegister.metrics());
});

// 404 catch-all
app.use((_req: Request, res: Response) => {
  res.status(404).json({ ok: false, error: 'not found' });
});

// ── Boot ──────────────────────────────────────────────────────────────────────
app.listen(PORT, BIND, () => {
  log('info', 'gni-started', { bind: BIND, port: PORT, cron: CRON_EXPR, version: SERVICE_VERSION });

  // First cycle immediately, then on cron
  void runCycle();
  cron.schedule(CRON_EXPR, () => { void runCycle(); });
});

process.on('SIGTERM', () => {
  log('info', 'gni-shutdown', {});
  process.exit(0);
});
