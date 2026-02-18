import type { HgConfig } from '../config.js';
import type { SqliteDb } from '../db/sqlite.js';
import type { Metrics } from './prom.js';
import { probeHttp, probeRpc } from '../sentry/chain.js';

export type ProbeSnapshot = {
  probe: string;
  ok: boolean;
  latency_ms: number;
  reason?: string;
  detail?: unknown;
  ts: number;
};

export type CollectorState = {
  startedAt: number;
  lastProbes: ProbeSnapshot[];
  lastSnapshotHash: string | null;
};

const now = () => Math.floor(Date.now() / 1000);

const computeSnapshotHash = (snap: ProbeSnapshot[]) => {
  const input = JSON.stringify(snap.map((p) => ({ probe: p.probe, ok: p.ok, latency_ms: p.latency_ms, reason: p.reason })));
  let h = 2166136261;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return `fnv1a32_${(h >>> 0).toString(16)}`;
};

const refreshIncidentGauges = (db: SqliteDb, metrics: Metrics, env: string) => {
  metrics.incidentsOpen.reset();
  const rows = db
    .prepare(
      `SELECT scope, severity, COUNT(1) AS n
       FROM incidents
       WHERE env = ? AND status = 'open'
       GROUP BY scope, severity`
    )
    .all(env) as Array<{ scope: string; severity: string; n: number }>;
  for (const row of rows) {
    metrics.incidentsOpen.set({ env, scope: row.scope, severity: row.severity }, Number(row.n));
  }
};

const refreshProposalGauges = (db: SqliteDb, metrics: Metrics, env: string) => {
  metrics.proposalsTotal.reset();
  const rows = db
    .prepare(
      `SELECT p.status, COUNT(1) AS n
       FROM proposals p
       INNER JOIN incidents i ON i.incident_id = p.incident_id
       WHERE i.env = ?
       GROUP BY p.status`
    )
    .all(env) as Array<{ status: string; n: number }>;
  for (const row of rows) {
    metrics.proposalsTotal.set({ env, status: row.status }, Number(row.n));
  }
};

export function startCollectors(cfg: HgConfig, db: SqliteDb, metrics: Metrics): CollectorState {
  const state: CollectorState = { startedAt: Date.now(), lastProbes: [], lastSnapshotHash: null };

  const tick = async () => {
    const snapshots: ProbeSnapshot[] = [];
    const timeoutMs = cfg.probes.timeoutMs;

    const rpcTargets: Array<{ name: string; url?: string }> = [
      { name: 'rpc_l1', url: cfg.rpc.l1 },
      { name: 'rpc_l2', url: cfg.rpc.l2 },
      { name: 'rpc_l3', url: cfg.rpc.l3 }
    ];
    for (const t of rpcTargets) {
      if (!t.url) continue;
      const r = await probeRpc(t.url, timeoutMs);
      snapshots.push({ probe: t.name, ok: r.ok, latency_ms: r.latency_ms, reason: r.reason, detail: r.detail, ts: now() });
      metrics.probeLatencyMs.labels(t.name).observe(r.latency_ms);
      if (!r.ok) metrics.probeFailuresTotal.labels(t.name, r.reason || 'failed').inc();
    }

    for (const url of cfg.probes.urls) {
      const stripped = url.startsWith('https://')
        ? url.slice('https://'.length)
        : url.startsWith('http://')
          ? url.slice('http://'.length)
          : url;
      const name = `http_${stripped.replace(/[^a-zA-Z0-9]+/g, '_').slice(0, 60)}`;
      const r = await probeHttp(url, timeoutMs);
      snapshots.push({ probe: name, ok: r.ok, latency_ms: r.latency_ms, reason: r.reason, ts: now() });
      metrics.probeLatencyMs.labels(name).observe(r.latency_ms);
      if (!r.ok) metrics.probeFailuresTotal.labels(name, r.reason || 'failed').inc();
    }

    state.lastProbes = snapshots;
    state.lastSnapshotHash = computeSnapshotHash(snapshots);

    metrics.uptimeSeconds.set(Math.floor((Date.now() - state.startedAt) / 1000));
    refreshIncidentGauges(db, metrics, cfg.env);
    refreshProposalGauges(db, metrics, cfg.env);
  };

  // initial
  tick().catch(() => undefined);
  setInterval(() => tick().catch(() => undefined), cfg.probes.intervalMs);

  return state;
}
