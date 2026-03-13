/**
 * ghost-noc-ai — GhostStack Network Operations Centre AI
 *
 * DETECT-ONLY: monitors infrastructure, emits proposals to the signing relay.
 * NO autonomous execution — all actions require human ratification via governance.
 *
 * Port:  7960 (NOC_PORT env)
 * Health: GET /health
 * Status: GET /status
 * Metrics: GET /metrics (Prometheus)
 * Proposals: GET /proposals/recent
 */

import express from 'express';
import type { Request, Response } from 'express';
import { runDockerMonitor }    from './monitors/dockerMonitor.js';
import { runVMMonitor }        from './monitors/vmMonitor.js';
import { runChainMonitor }     from './monitors/chainMonitor.js';
import { runValidatorMonitor } from './monitors/validatorMonitor.js';
import { runNodeMonitor }      from './monitors/nodeMonitor.js';
import { registry, alertsTotal, proposalsTotal, monitorRunTotal, monitorErrorTotal, activeAlertsGauge } from './telemetry/metrics.js';
import type { NocAlert, NocProposal, NocStatus } from './types.js';

const PORT          = Number(process.env.NOC_PORT ?? 7960);
const POLL_MS       = Number(process.env.NOC_POLL_INTERVAL_MS ?? 30_000);
const DRY_RUN       = process.env.DRY_RUN === '1' || process.env.NOC_DRY_RUN === '1';
const RELAY_URL     = process.env.SIGNING_RELAY_URL ?? 'http://localhost:7910';
const MAX_HISTORY   = 200;

const app = express();
app.disable('x-powered-by');
app.use(express.json());

// ── State ──────────────────────────────────────────────────────────────────
let recentAlerts:    NocAlert[]    = [];
let recentProposals: NocProposal[] = [];
let lastRun: string | null         = null;
const START_TIME                   = Date.now();

// ── Signing relay submission ───────────────────────────────────────────────
async function submitProposal(p: NocProposal): Promise<void> {
  if (DRY_RUN) {
    console.log('[DRY_RUN] Would submit proposal:', JSON.stringify(p));
    return;
  }
  try {
    const res = await fetch(`${RELAY_URL}/proposals`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(p),
      signal:  AbortSignal.timeout(8_000),
    });
    if (!res.ok) {
      console.warn(`[noc] Signing relay returned HTTP ${res.status} for proposal ${p.id}`);
    } else {
      console.log(`[noc] Submitted proposal ${p.id} (${p.action} ${p.entityType} ${p.target})`);
    }
  } catch (err) {
    console.warn(`[noc] Failed to submit proposal ${p.id}:`, err instanceof Error ? err.message : err);
  }
}

// ── Monitor loop ───────────────────────────────────────────────────────────
const MONITORS = [
  { name: 'docker',    run: runDockerMonitor },
  { name: 'vm',        run: runVMMonitor },
  { name: 'chain',     run: runChainMonitor },
  { name: 'validator', run: runValidatorMonitor },
  { name: 'node',      run: runNodeMonitor },
] as const;

async function runAll(): Promise<void> {
  lastRun = new Date().toISOString();
  const newAlerts:    NocAlert[]    = [];
  const newProposals: NocProposal[] = [];

  await Promise.all(MONITORS.map(async ({ name, run }) => {
    monitorRunTotal.inc({ monitor: name });
    try {
      const result = await run();
      for (const alert of result.alerts) {
        newAlerts.push(alert);
        alertsTotal.inc({ monitor: name, severity: alert.severity });
      }
      for (const proposal of result.proposals) {
        newProposals.push(proposal);
        proposalsTotal.inc({ monitor: name, action: proposal.action });
        void submitProposal(proposal);
      }
    } catch (err) {
      monitorErrorTotal.inc({ monitor: name });
      console.error(`[noc] Monitor "${name}" threw:`, err instanceof Error ? err.message : err);
    }
  }));

  // Merge into history (newest first, capped)
  recentAlerts    = [...newAlerts,    ...recentAlerts   ].slice(0, MAX_HISTORY);
  recentProposals = [...newProposals, ...recentProposals].slice(0, MAX_HISTORY);

  // Update active alert gauge
  const unresolved = recentAlerts.filter((a) => !a.resolved).length;
  activeAlertsGauge.set(unresolved);

  if (newAlerts.length > 0) {
    console.log(`[noc] Cycle complete — ${newAlerts.length} alerts, ${newProposals.length} proposals`);
  }
}

// ── HTTP endpoints ─────────────────────────────────────────────────────────
app.get('/health', (_req: Request, res: Response) => {
  res.json({ ok: true, service: 'ghost-noc-ai', uptime: Math.round((Date.now() - START_TIME) / 1000) });
});

app.get('/healthz', (_req: Request, res: Response) => {
  res.json({ ok: true });
});

app.get('/status', (_req: Request, res: Response) => {
  const status: NocStatus = {
    healthy:         true,
    uptime:          Math.round((Date.now() - START_TIME) / 1000),
    monitors:        MONITORS.map((m) => m.name),
    recentAlerts:    recentAlerts.slice(0, 50),
    recentProposals: recentProposals.slice(0, 20),
    alertCount:      recentAlerts.length,
    proposalCount:   recentProposals.length,
    lastRun,
    dryRun:          DRY_RUN,
  };
  res.json(status);
});

app.get('/proposals/recent', (_req: Request, res: Response) => {
  res.json({ proposals: recentProposals.slice(0, 50) });
});

app.get('/alerts', (_req: Request, res: Response) => {
  const severity = (_req as Request & { query: Record<string, string> }).query['severity'];
  const filtered = severity
    ? recentAlerts.filter((a) => a.severity === severity)
    : recentAlerts;
  res.json({ alerts: filtered.slice(0, 100) });
});

app.get('/metrics', async (_req: Request, res: Response) => {
  res.set('Content-Type', registry.contentType);
  res.end(await registry.metrics());
});

// ── Startup ────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`[ghost-noc-ai] Listening on port ${PORT} | DRY_RUN=${DRY_RUN} | poll=${POLL_MS}ms`);
  console.log(`[ghost-noc-ai] Signing relay: ${RELAY_URL}`);
  void runAll();
  setInterval(() => { void runAll(); }, POLL_MS);
});
