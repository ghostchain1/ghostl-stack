/**
 * ghost-observability — GhostStack Custom Rollup Observability Sidecar
 * =====================================================================
 *
 * Aggregates health, metrics, and trace data from all 6 custom rollup
 * services (ghost-exec, ghost-sequencer, ghost-deriver, ghost-settlement,
 * ghost-bridge, ghost-proof) for both L2 (chainId=901) and L3 (chainId=903).
 *
 * Exposes:
 *   GET  /healthz                  — own liveness
 *   GET  /readyz                   — ready only when all required services reachable
 *   GET  /metrics                  — Prometheus-compatible text exposition
 *   GET  /status                   — full JSON snapshot of all scraped states
 *   GET  /status/:service          — single-service snapshot
 *   GET  /alerts                   — active alert list
 *   POST /alerts/:id/ack           — acknowledge an alert
 *
 * Environment variables:
 *   PORT                  HTTP listen port (default: 7276)
 *   SCRAPE_INTERVAL_MS    how often to poll all services (default: 15000)
 *   GHOST_EXEC_L2_URL     (default: http://localhost:7260)
 *   GHOST_SEQUENCER_L2_URL (default: http://localhost:7261)
 *   GHOST_DERIVER_L2_URL  (default: http://localhost:7262)
 *   GHOST_SETTLEMENT_L2_URL (default: http://localhost:7263)
 *   GHOST_BRIDGE_L2_URL   (default: http://localhost:7264)
 *   GHOST_PROOF_L2_URL    (default: http://localhost:7265)
 *   GHOST_EXEC_L3_URL     (default: http://localhost:7270)
 *   GHOST_SEQUENCER_L3_URL (default: http://localhost:7271)
 *   GHOST_DERIVER_L3_URL  (default: http://localhost:7272)
 *   GHOST_SETTLEMENT_L3_URL (default: http://localhost:7273)
 *   GHOST_BRIDGE_L3_URL   (default: http://localhost:7274)
 *   GHOST_PROOF_L3_URL    (default: http://localhost:7275)
 *   ALERT_MISS_THRESHOLD  consecutive failures before alerting (default: 3)
 */

import 'dotenv/config';
import express from 'express';
import type { Request, Response } from 'express';
import http from 'node:http';
import process from 'node:process';

const PORT              = Number(process.env.PORT              ?? '7276');
const SCRAPE_INTERVAL   = Number(process.env.SCRAPE_INTERVAL_MS ?? '15000');
const MISS_THRESHOLD    = Number(process.env.ALERT_MISS_THRESHOLD ?? '3');

// ── Service registry ─────────────────────────────────────────────────────────
interface ServiceTarget {
  id: string;
  layer: 'l2' | 'l3';
  name: string;
  url: string;
}

const TARGETS: ServiceTarget[] = [
  { id: 'ghost-exec-l2',        layer: 'l2', name: 'ghost-exec',        url: (process.env.GHOST_EXEC_L2_URL        ?? 'http://localhost:7260').replace(/\/$/, '') },
  { id: 'ghost-sequencer-l2',   layer: 'l2', name: 'ghost-sequencer',   url: (process.env.GHOST_SEQUENCER_L2_URL   ?? 'http://localhost:7261').replace(/\/$/, '') },
  { id: 'ghost-deriver-l2',     layer: 'l2', name: 'ghost-deriver',     url: (process.env.GHOST_DERIVER_L2_URL     ?? 'http://localhost:7262').replace(/\/$/, '') },
  { id: 'ghost-settlement-l2',  layer: 'l2', name: 'ghost-settlement',  url: (process.env.GHOST_SETTLEMENT_L2_URL  ?? 'http://localhost:7263').replace(/\/$/, '') },
  { id: 'ghost-bridge-l2',      layer: 'l2', name: 'ghost-bridge',      url: (process.env.GHOST_BRIDGE_L2_URL      ?? 'http://localhost:7264').replace(/\/$/, '') },
  { id: 'ghost-proof-l2',       layer: 'l2', name: 'ghost-proof',       url: (process.env.GHOST_PROOF_L2_URL       ?? 'http://localhost:7265').replace(/\/$/, '') },
  { id: 'ghost-exec-l3',        layer: 'l3', name: 'ghost-exec',        url: (process.env.GHOST_EXEC_L3_URL        ?? 'http://localhost:7270').replace(/\/$/, '') },
  { id: 'ghost-sequencer-l3',   layer: 'l3', name: 'ghost-sequencer',   url: (process.env.GHOST_SEQUENCER_L3_URL   ?? 'http://localhost:7271').replace(/\/$/, '') },
  { id: 'ghost-deriver-l3',     layer: 'l3', name: 'ghost-deriver',     url: (process.env.GHOST_DERIVER_L3_URL     ?? 'http://localhost:7272').replace(/\/$/, '') },
  { id: 'ghost-settlement-l3',  layer: 'l3', name: 'ghost-settlement',  url: (process.env.GHOST_SETTLEMENT_L3_URL  ?? 'http://localhost:7273').replace(/\/$/, '') },
  { id: 'ghost-bridge-l3',      layer: 'l3', name: 'ghost-bridge',      url: (process.env.GHOST_BRIDGE_L3_URL      ?? 'http://localhost:7274').replace(/\/$/, '') },
  { id: 'ghost-proof-l3',       layer: 'l3', name: 'ghost-proof',       url: (process.env.GHOST_PROOF_L3_URL       ?? 'http://localhost:7275').replace(/\/$/, '') },
];

// ── State ────────────────────────────────────────────────────────────────────
interface ServiceSnapshot {
  id: string;
  layer: 'l2' | 'l3';
  name: string;
  url: string;
  healthy: boolean;
  consecutiveMisses: number;
  lastScrapeMs: number | null;
  lastStatus: Record<string, unknown> | null;
  latencyMs: number | null;
}

interface Alert {
  id: string;
  serviceId: string;
  message: string;
  firedAt: string;
  ackedAt: string | null;
}

const state = new Map<string, ServiceSnapshot>(
  TARGETS.map((t) => [
    t.id,
    {
      id: t.id,
      layer: t.layer,
      name: t.name,
      url: t.url,
      healthy: false,
      consecutiveMisses: 0,
      lastScrapeMs: null,
      lastStatus: null,
      latencyMs: null,
    },
  ])
);

const alerts = new Map<string, Alert>();

// ── Scrape ───────────────────────────────────────────────────────────────────
const fetchJson = async (url: string, timeoutMs = 5000): Promise<{ ok: boolean; data: Record<string, unknown> | null; latencyMs: number }> => {
  const start = Date.now();
  return new Promise((resolve) => {
    const req = http.get(url, { timeout: timeoutMs }, (res) => {
      let body = '';
      res.on('data', (chunk: Buffer) => { body += chunk.toString(); });
      res.on('end', () => {
        const latencyMs = Date.now() - start;
        try {
          const data = JSON.parse(body) as Record<string, unknown>;
          resolve({ ok: res.statusCode === 200, data, latencyMs });
        } catch {
          resolve({ ok: false, data: null, latencyMs });
        }
      });
    });
    req.on('error', () => resolve({ ok: false, data: null, latencyMs: Date.now() - start }));
    req.on('timeout', () => { req.destroy(); resolve({ ok: false, data: null, latencyMs: timeoutMs }); });
  });
};

const raiseAlert = (serviceId: string, message: string): void => {
  const id = `${serviceId}-down`;
  if (alerts.has(id) && alerts.get(id)!.ackedAt === null) return;
  alerts.set(id, { id, serviceId, message, firedAt: new Date().toISOString(), ackedAt: null });
};

const clearAlert = (serviceId: string): void => {
  const id = `${serviceId}-down`;
  alerts.delete(id);
};

const scrape = async (): Promise<void> => {
  await Promise.all(
    TARGETS.map(async (target) => {
      const snap = state.get(target.id)!;
      const { ok, data, latencyMs } = await fetchJson(`${target.url}/status`);
      snap.lastScrapeMs = Date.now();
      snap.latencyMs = latencyMs;
      if (ok) {
        snap.healthy = true;
        snap.consecutiveMisses = 0;
        snap.lastStatus = data;
        clearAlert(target.id);
      } else {
        snap.healthy = false;
        snap.consecutiveMisses += 1;
        if (snap.consecutiveMisses >= MISS_THRESHOLD) {
          raiseAlert(target.id, `${target.id} unreachable after ${snap.consecutiveMisses} consecutive failures`);
        }
      }
    })
  );
};

// ── Prometheus metrics format ────────────────────────────────────────────────
const buildMetrics = (): string => {
  const lines: string[] = [
    '# HELP ghost_rollup_service_up Whether the custom rollup service is reachable (1=up, 0=down)',
    '# TYPE ghost_rollup_service_up gauge',
  ];
  for (const snap of state.values()) {
    const labels = `service="${snap.id}",layer="${snap.layer}",name="${snap.name}"`;
    lines.push(`ghost_rollup_service_up{${labels}} ${snap.healthy ? 1 : 0}`);
  }
  lines.push('');
  lines.push('# HELP ghost_rollup_service_latency_ms Last health scrape latency in ms');
  lines.push('# TYPE ghost_rollup_service_latency_ms gauge');
  for (const snap of state.values()) {
    if (snap.latencyMs !== null) {
      const labels = `service="${snap.id}",layer="${snap.layer}"`;
      lines.push(`ghost_rollup_service_latency_ms{${labels}} ${snap.latencyMs}`);
    }
  }
  lines.push('');
  lines.push('# HELP ghost_rollup_active_alerts Number of unacked service alerts');
  lines.push('# TYPE ghost_rollup_active_alerts gauge');
  const unacked = Array.from(alerts.values()).filter((a) => a.ackedAt === null).length;
  lines.push(`ghost_rollup_active_alerts ${unacked}`);
  lines.push('');
  return lines.join('\n');
};

// ── Express app ──────────────────────────────────────────────────────────────
const app = express();
app.disable('x-powered-by');
app.use(express.json());

app.get('/healthz', (_req: Request, res: Response) => {
  res.json({ ok: true, service: 'ghost-observability', ts: new Date().toISOString() });
});

app.get('/readyz', (_req: Request, res: Response) => {
  const allUp = Array.from(state.values()).every((s) => s.healthy);
  res.status(allUp ? 200 : 503).json({
    ready: allUp,
    services: Object.fromEntries(Array.from(state.values()).map((s) => [s.id, s.healthy])),
  });
});

app.get('/metrics', (_req: Request, res: Response) => {
  res.type('text/plain; version=0.0.4; charset=utf-8').send(buildMetrics());
});

app.get('/status', (_req: Request, res: Response) => {
  res.json({
    ts: new Date().toISOString(),
    services: Array.from(state.values()),
    alerts: Array.from(alerts.values()),
  });
});

app.get('/status/:service', (req: Request, res: Response) => {
  const snap = state.get(req.params.service);
  if (!snap) { res.status(404).json({ error: 'not_found' }); return; }
  res.json(snap);
});

app.get('/alerts', (_req: Request, res: Response) => {
  res.json({ alerts: Array.from(alerts.values()) });
});

app.post('/alerts/:id/ack', (req: Request, res: Response) => {
  const alert = alerts.get(req.params.id);
  if (!alert) { res.status(404).json({ error: 'not_found' }); return; }
  alert.ackedAt = new Date().toISOString();
  res.json({ ok: true, alert });
});

// ── Start ────────────────────────────────────────────────────────────────────
const server = app.listen(PORT, () => {
  console.log(`[ghost-observability] Listening on :${PORT}`);
  console.log(`[ghost-observability] Scraping ${TARGETS.length} targets every ${SCRAPE_INTERVAL}ms`);
});

// Initial scrape then schedule
(async () => { await scrape(); })().catch(console.error);
const timer = setInterval(() => { scrape().catch(console.error); }, SCRAPE_INTERVAL);

process.on('SIGTERM', () => {
  clearInterval(timer);
  server.close(() => { console.log('[ghost-observability] Graceful shutdown complete'); process.exit(0); });
});
