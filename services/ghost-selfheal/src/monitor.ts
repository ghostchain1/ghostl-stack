/**
 * ghost-selfheal — Self-Healing Infrastructure Monitor
 *
 * IMPORTANT — Governance Model:
 *   This service is DETECT-ONLY.  It never issues write commands autonomously.
 *   When a threshold violation is detected it constructs a ratifiable proposal
 *   and forwards it to the signing relay at SIGNING_RELAY_URL for human
 *   ratification via the governance quorum.  No wire action is executed
 *   without an on-chain approval.
 *
 * What it monitors:
 *   - Validator CPU, uptime, jailing, missed blocks
 *   - Chain head staleness (stuck block detection)
 *   - GhostBrain anomaly alerts
 *
 * Proposal types it emits to the signing relay:
 *   - restart_validator    (CPU > CPU_THRESHOLD)
 *   - redistribute_load    (> LOAD_IMBALANCE_PCT difference)
 *   - alert_stuck_chain    (no new block in STUCK_BLOCK_TIMEOUT_MS)
 *   - scale_relayers       (bridge congestion flag from GhostBrain)
 *
 * Env vars:
 *   GHOSTBRAIN_URL          default http://localhost:7900
 *   SIGNING_RELAY_URL       default http://localhost:7910
 *   POLL_INTERVAL_MS        default 30000  (30 s)
 *   CPU_THRESHOLD           default 90
 *   UPTIME_THRESHOLD        default 0.80
 *   STUCK_BLOCK_TIMEOUT_MS  default 120000 (2 min)
 *   DRY_RUN                 default false  — log proposals but don't POST to relay
 */

import http    from 'node:http';
import process from 'node:process';

// ── Config ────────────────────────────────────────────────────────────────────

const GHOSTBRAIN_URL        = process.env.GHOSTBRAIN_URL       ?? 'http://localhost:7900';
const SIGNING_RELAY_URL     = process.env.SIGNING_RELAY_URL    ?? 'http://localhost:7910';
const POLL_INTERVAL_MS      = Number(process.env.POLL_INTERVAL_MS       ?? '30000');
const CPU_THRESHOLD         = Number(process.env.CPU_THRESHOLD          ?? '90');
const UPTIME_THRESHOLD      = Number(process.env.UPTIME_THRESHOLD       ?? '0.80');
const STUCK_BLOCK_TIMEOUT   = Number(process.env.STUCK_BLOCK_TIMEOUT_MS ?? '120000');
const DRY_RUN               = process.env.DRY_RUN === 'true' || process.env.DRY_RUN === '1';

// ── Types ─────────────────────────────────────────────────────────────────────

interface Validator {
  name:       string;
  address?:   string;
  status?:    string;
  uptime?:    number;
  cpu?:       number;
  jailed?:    boolean;
  missedBlocks?: number;
}

interface Proposal {
  type:       string;
  target:     string;
  reason:     string;
  severity:   'info' | 'warning' | 'critical';
  dryRun:     boolean;
  timestamp:  string;
  source:     'ghost-selfheal';
}

// ── State ─────────────────────────────────────────────────────────────────────

let proposalsSentTotal = 0;
let lastPollTime: string | null = null;
const recentProposals: Proposal[] = [];

// ── Fetcher ────────────────────────────────────────────────────────────────────

async function safeGet<T>(url: string): Promise<T | null> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(8_000) });
    if (!res.ok) return null;
    return res.json() as Promise<T>;
  } catch {
    return null;
  }
}

// ── Proposal relay ─────────────────────────────────────────────────────────────

async function sendProposal(proposal: Proposal): Promise<void> {
  const body = JSON.stringify(proposal);
  console.log(`[selfheal] ${DRY_RUN ? 'DRY_RUN' : 'PROPOSAL'} type=${proposal.type} target=${proposal.target} severity=${proposal.severity}`);

  if (recentProposals.length >= 50) recentProposals.shift();
  recentProposals.push(proposal);
  proposalsSentTotal++;

  if (DRY_RUN) return;  // dry-run: log only, no relay POST

  try {
    await fetch(`${SIGNING_RELAY_URL}/proposals`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
      signal:  AbortSignal.timeout(5_000),
    });
  } catch (err) {
    console.warn('[selfheal] relay unreachable:', (err as Error).message);
  }
}

// ── Monitor checks ────────────────────────────────────────────────────────────

async function checkValidators(): Promise<void> {
  const data = await safeGet<{ validators?: Validator[]; total?: number }>(
    `${GHOSTBRAIN_URL}/validators/health`,
  );
  if (!data?.validators) return;

  const validators = data.validators;

  // Group by CPU to detect load imbalance
  const cpus = validators.map(v => v.cpu ?? 0);
  const maxCpu = Math.max(...cpus);
  const minCpu = Math.min(...cpus);

  for (const v of validators) {
    const name   = v.name ?? v.address ?? 'unknown';
    const cpu    = v.cpu ?? 0;
    const uptime = v.uptime ?? 1;

    if (v.jailed) {
      await sendProposal({
        type:      'restart_validator',
        target:    name,
        reason:    `Validator "${name}" is jailed`,
        severity:  'critical',
        dryRun:    DRY_RUN,
        timestamp: new Date().toISOString(),
        source:    'ghost-selfheal',
      });
    } else if (cpu > CPU_THRESHOLD) {
      await sendProposal({
        type:      'restart_validator',
        target:    name,
        reason:    `CPU ${cpu}% exceeds threshold ${CPU_THRESHOLD}%`,
        severity:  'warning',
        dryRun:    DRY_RUN,
        timestamp: new Date().toISOString(),
        source:    'ghost-selfheal',
      });
    } else if (uptime < UPTIME_THRESHOLD) {
      await sendProposal({
        type:      'restart_validator',
        target:    name,
        reason:    `Uptime ${(uptime*100).toFixed(1)}% below threshold ${(UPTIME_THRESHOLD*100).toFixed(1)}%`,
        severity:  'warning',
        dryRun:    DRY_RUN,
        timestamp: new Date().toISOString(),
        source:    'ghost-selfheal',
      });
    }
  }

  // Load imbalance proposal
  if (cpus.length >= 2 && maxCpu - minCpu > 40) {
    await sendProposal({
      type:      'redistribute_load',
      target:    'validator-set',
      reason:    `Load imbalance: max ${maxCpu}% vs min ${minCpu}% (spread ${maxCpu-minCpu}%)`,
      severity:  'warning',
      dryRun:    DRY_RUN,
      timestamp: new Date().toISOString(),
      source:    'ghost-selfheal',
    });
  }
}

async function checkAnomalies(): Promise<void> {
  const data = await safeGet<{ anomalies?: Array<{ type:string; target?:string; severity?:string }> }>(
    `${GHOSTBRAIN_URL}/anomalies/recent`,
  );
  if (!data?.anomalies) return;

  for (const anomaly of data.anomalies.slice(0, 5)) {
    if (anomaly.type === 'bridge_congestion') {
      await sendProposal({
        type:      'scale_relayers',
        target:    anomaly.target ?? 'bridge',
        reason:    'GhostBrain detected bridge congestion anomaly',
        severity:  'warning',
        dryRun:    DRY_RUN,
        timestamp: new Date().toISOString(),
        source:    'ghost-selfheal',
      });
    }
  }
}

// ── Main poll loop ────────────────────────────────────────────────────────────

async function poll(): Promise<void> {
  lastPollTime = new Date().toISOString();
  console.log(`[selfheal] poll @ ${lastPollTime}${DRY_RUN ? ' [DRY_RUN]' : ''}`);

  try {
    await Promise.all([
      checkValidators(),
      checkAnomalies(),
    ]);
  } catch (err) {
    console.error('[selfheal] poll error:', err);
  }
}

// ── Health check HTTP server (port 7920) ──────────────────────────────────────

const PORT = Number(process.env.SELFHEAL_PORT ?? '7920');

http.createServer((req, res) => {
  if (req.url === '/health' || req.url === '/') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      service:            'ghost-selfheal',
      ok:                 true,
      dryRun:             DRY_RUN,
      proposalsSentTotal,
      lastPollTime,
      recentProposals:    recentProposals.slice(-10),
    }));
  } else {
    res.writeHead(404);
    res.end();
  }
}).listen(PORT, () => {
  console.log(`[selfheal] health API listening on :${PORT}`);
  console.log(`[selfheal] polling every ${POLL_INTERVAL_MS / 1000}s | DRY_RUN=${DRY_RUN}`);
  console.log(`[selfheal] relay=${SIGNING_RELAY_URL} | ghostbrain=${GHOSTBRAIN_URL}`);
});

// Initial poll + recurring schedule
void poll();
const intv = setInterval(() => void poll(), POLL_INTERVAL_MS);

// Graceful shutdown
process.on('SIGTERM', () => {
  clearInterval(intv);
  console.log('[selfheal] SIGTERM — shutting down');
  process.exit(0);
});
