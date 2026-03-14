/**
 * Ghost Sovereign Security AI (SSA) — HTTP Server & Scan Orchestrator
 *
 * Port: SSA_PORT (default 7990)
 * Scan cycle: SSA_CRON_EXPR — defaults to every 30 seconds via node-cron
 * six-field syntax (seconds field included).
 *
 *   GET /health           — liveness
 *   GET /healthz          — readiness
 *   GET /status           — full SsaStatus JSON
 *   GET /threats/recent   — last 20 threat events
 *   GET /proposals/recent — last 20 security proposals
 *   GET /contracts        — contract snapshots
 *   GET /validators       — last validator scan info
 *   GET /rpc              — RPC shield block states + abuse stats
 *   GET /treasury         — treasury balance + status
 *   GET /network          — latest network snapshot
 *   GET /metrics          — Prometheus metrics
 */

import express, { Request, Response, NextFunction } from 'express';
import cron                                          from 'node-cron';
import { register, Counter, Gauge }                 from 'prom-client';

import { scanContracts, getContractSnapshots, getContractStatus } from './contract/contractScanner.js';
import { analyseExploits }                         from './contract/exploitDetector.js';
import { monitorValidators, checkSigningHealth, getValidatorStatus } from './validator/validatorGuard.js';
import { checkSlashing }                           from './validator/slashingMonitor.js';
import { analyseRpc, getBlockStates, getRpcStatus }from './rpc/rpcShield.js';
import { detectAbuse, getAbuseStatus, getRpcStats }from './rpc/abuseDetector.js';
import { guardTreasury, getTreasuryStatus, getTreasuryBalance } from './treasury/treasuryGuard.js';
import { inspectNetwork, getNetworkStatus, getLastNetworkSnapshot } from './network/networkIDS.js';
import { analyseTraffic, getTrafficStatus }        from './network/trafficAnalyser.js';
import { mitigateIfNeeded }                        from './defense/mitigationEngine.js';
import {
  getRecentThreats,
  getRecentProposals,
  getTotalProposalCount,
  currentThreatLevel,
} from './securityBus.js';
import type { SsaStatus, ComponentStatus }         from './types.js';

// ── Config ────────────────────────────────────────────────────────────────────

const PORT      = Number(process.env.SSA_PORT      ?? 7990);
const DRY_RUN   = process.env.SSA_DRY_RUN          === '1';
// Cron: every 30 seconds. Expressed as a variable to avoid */30 in block comments.
const CRON_EXPR = process.env.SSA_CRON_EXPR        ?? '*/30 * * * * *';
const START_TS  = Date.now();

// ── Prometheus metrics ────────────────────────────────────────────────────────

const cCycles     = new Counter({ name: 'ssa_cycles_total',    help: 'Total SSA scan cycles completed' });
const cErrors     = new Counter({ name: 'ssa_errors_total',    help: 'Total SSA errors during scan' });
const cProposals  = new Counter({ name: 'ssa_proposals_total', help: 'Total security proposals generated' });
const cThreats    = new Counter({ name: 'ssa_threats_total',   help: 'Total threat events recorded' });

const gThreatLevel  = new Gauge({ name: 'ssa_threat_level',       help: 'Current threat level (0=none…4=critical)' });
const gContracts    = new Gauge({ name: 'ssa_component_contracts', help: 'Contract component health (0=secure,1=warning,2=alert)' });
const gValidators   = new Gauge({ name: 'ssa_component_validators',help: 'Validator component health' });
const gRpc          = new Gauge({ name: 'ssa_component_rpc',       help: 'RPC component health' });
const gTreasury     = new Gauge({ name: 'ssa_component_treasury',  help: 'Treasury component health' });
const gNetwork      = new Gauge({ name: 'ssa_component_network',   help: 'Network component health' });

const THREAT_LEVEL_MAP = { none: 0, low: 1, medium: 2, high: 3, critical: 4 } as const;
const COMPONENT_MAP    = { secure: 0, warning: 1, alert: 2, unknown: 3 } as const;

function statusVal(s: ComponentStatus): number { return COMPONENT_MAP[s] ?? 3; }

// ── Helpers ───────────────────────────────────────────────────────────────────

function worstOf(...statuses: ComponentStatus[]): ComponentStatus {
  return statuses.reduce((a, b) => statusVal(a) >= statusVal(b) ? a : b, 'secure' as ComponentStatus);
}

// ── State ────────────────────────────────────────────────────────────────────

let _running       = false;
let _totalCycles   = 0;
let _errors        = 0;
let _lastCycleMs: number | null = null;
let _prevThreatCount = 0;
let _prevProposalCount = 0;

// ── Security scan ─────────────────────────────────────────────────────────────

async function runSecurityScan(): Promise<void> {
  if (DRY_RUN) {
    console.log('[SSA] DRY_RUN active — scan logged but no proposals submitted');
    return;
  }

  const t0 = Date.now();
  _running = true;

  try {
    // 1. Contract scanning
    await scanContracts();
    const snapshots = getContractSnapshots();
    await analyseExploits(snapshots);

    // 2. Validator monitoring
    await monitorValidators();
    await checkSigningHealth();
    await checkSlashing();

    // 3. RPC health + abuse detection
    await analyseRpc();
    await detectAbuse();

    // 4. Treasury guard
    await guardTreasury();

    // 5. Network IDS + traffic analysis
    const networkSnapshot = await inspectNetwork();
    await analyseTraffic(networkSnapshot);

    // 6. Mitigation — generate advisory proposals for recent high+ events
    const recent = getRecentThreats(10);
    for (const evt of recent) {
      // Only act on threats from the current cycle (within 2× scan window)
      const age = Date.now() - evt.ts;
      if (age < 65_000) {
        await mitigateIfNeeded(evt);
      }
    }

    _lastCycleMs = Date.now() - t0;
    cCycles.inc();
    _totalCycles++;

    // Update Prometheus gauges
    const level = currentThreatLevel();
    gThreatLevel.set(THREAT_LEVEL_MAP[level] ?? 0);
    gContracts.set(statusVal(getContractStatus()));
    gValidators.set(statusVal(getValidatorStatus()));
    gRpc.set(statusVal(worstOf(getRpcStatus(), getAbuseStatus())));
    gTreasury.set(statusVal(getTreasuryStatus()));
    gNetwork.set(statusVal(worstOf(getNetworkStatus(), getTrafficStatus())));

    // Count new threats + proposals
    const newThreats   = getRecentThreats(50).length;
    const newProposals = getTotalProposalCount();
    const threatDelta  = newThreats - _prevThreatCount;
    const propDelta    = newProposals - _prevProposalCount;
    if (threatDelta > 0)  { cThreats.inc(threatDelta); _prevThreatCount = newThreats; }
    if (propDelta   > 0)  { cProposals.inc(propDelta); _prevProposalCount = newProposals; }

    console.log(
      `[SSA] Cycle #${_totalCycles} completed in ${_lastCycleMs}ms — threatLevel=${level}`
    );
  } catch (err) {
    _errors++;
    cErrors.inc();
    console.error('[SSA] Scan cycle error:', (err as Error).message);
  } finally {
    _running = false;
  }
}

// ── Express app ───────────────────────────────────────────────────────────────

const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: '64kb' }));

// Security headers
app.use((_req: Request, res: Response, next: NextFunction) => {
  res.set('X-Content-Type-Options', 'nosniff');
  res.set('X-Frame-Options',        'DENY');
  res.set('Cache-Control',          'no-store');
  next();
});

function buildStatus(): SsaStatus {
  return {
    running:            _running,
    dryRun:             DRY_RUN,
    totalCycles:        _totalCycles,
    errors:             _errors,
    proposals:          getTotalProposalCount(),
    lastCycleMs:        _lastCycleMs,
    uptime:             Date.now() - START_TS,
    overallThreatLevel: currentThreatLevel(),
    components: {
      contracts:  getContractStatus(),
      validators: getValidatorStatus(),
      rpc:        worstOf(getRpcStatus(), getAbuseStatus()),
      treasury:   getTreasuryStatus(),
      network:    worstOf(getNetworkStatus(), getTrafficStatus()),
    },
    recentThreats:   getRecentThreats(20),
    recentProposals: getRecentProposals(20),
  };
}

app.get('/health',  (_req, res) => res.json({ ok: true }));
app.get('/healthz', (_req, res) => res.json({ ok: true, uptime: Date.now() - START_TS }));
app.get('/status',  (_req, res) => res.json(buildStatus()));

app.get('/threats/recent',   (_req, res) => res.json({ threats:   getRecentThreats(50) }));
app.get('/proposals/recent', (_req, res) => res.json({ proposals: getRecentProposals(50) }));

app.get('/contracts', (_req, res) => res.json({
  status:    getContractStatus(),
  snapshots: getContractSnapshots(),
}));

app.get('/validators', (_req, res) => res.json({
  status: getValidatorStatus(),
}));

app.get('/rpc', (_req, res) => res.json({
  shield:  { status: getRpcStatus(),    blockStates: getBlockStates() },
  abuse:   { status: getAbuseStatus(),  ...getRpcStats() },
}));

app.get('/treasury', (_req, res) => res.json({
  status:     getTreasuryStatus(),
  balanceGst: getTreasuryBalance(),
}));

app.get('/network', (_req, res) => res.json({
  status:   getNetworkStatus(),
  snapshot: getLastNetworkSnapshot(),
}));

app.get('/metrics', async (_req, res) => {
  res.set('Content-Type', register.contentType);
  res.end(await register.metrics());
});

// ── Startup ───────────────────────────────────────────────────────────────────

const server = app.listen(PORT, () => {
  console.log(`[SSA] Ghost Sovereign Security AI listening on :${PORT}`);
  console.log(`[SSA] Scan cron: ${CRON_EXPR} | DRY_RUN=${DRY_RUN}`);
});

// Initial scan on startup
setTimeout(() => { runSecurityScan().catch(console.error); }, 3_000);

// Scheduled scan
cron.schedule(CRON_EXPR, () => {
  runSecurityScan().catch(console.error);
});

// Graceful shutdown
function shutdown(signal: string): void {
  console.log(`[SSA] Received ${signal} — shutting down`);
  server.close(() => { process.exit(0); });
  setTimeout(() => { process.exit(1); }, 10_000);
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT',  () => shutdown('SIGINT'));
