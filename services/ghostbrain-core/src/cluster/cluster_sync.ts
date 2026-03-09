/**
 * GhostBrain Core — Cluster Sync
 *
 * Pushes local AI-memory snapshots (fixes, patterns, vectors) to the
 * ghostbrain-memory service and ships aggregate infra metrics to the
 * ghostbrain-cluster coordinator so the global federation has a live
 * picture of this node's health.
 */

import { request }           from "undici";
import { getAllFixes }        from "../memory/fix_memory.js";
import { patternStats }      from "../memory/pattern_memory.js";
import { getInfraHistory }   from "../memory/infrastructure_memory.js";

const MEMORY_URL    = process.env.MEMORY_SERVICE_URL   ?? "";
const CLUSTER_URL   = process.env.CLUSTER_URL           ?? "";
const SYNC_INT      = Number(process.env.SYNC_INTERVAL_MS ?? "60000");
const NODE_ID       = `ghostbrain-core-${process.env.HOSTNAME ?? "local"}`;

let _syncInterval: ReturnType<typeof setInterval> | null = null;

// ── Sync stats ────────────────────────────────────────────────────────────────

const _stats = { cycles: 0, fixesPushed: 0, patternsPushed: 0, metricPushes: 0, errors: 0 };

// ── Helpers ───────────────────────────────────────────────────────────────────

async function pushFixes(): Promise<void> {
  if (!MEMORY_URL) return;
  const fixes = getAllFixes();
  if (fixes.length === 0) return;
  try {
    const res = await request(`${MEMORY_URL}/api/v1/memory/fixes/bulk`, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ nodeId: NODE_ID, fixes, ts: Date.now() }),
      bodyTimeout: 8_000,
    });
    if (res.statusCode < 300) {
      _stats.fixesPushed += fixes.length;
    } else {
      await res.body.dump();
    }
  } catch { _stats.errors++; }
}

async function pushPatternStats(): Promise<void> {
  if (!MEMORY_URL) return;
  const stats = patternStats();
  try {
    const res = await request(`${MEMORY_URL}/api/v1/memory/patterns/stats`, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ nodeId: NODE_ID, stats, ts: Date.now() }),
      bodyTimeout: 5_000,
    });
    if (res.statusCode < 300) {
      _stats.patternsPushed++;
    } else {
      await res.body.dump();
    }
  } catch { _stats.errors++; }
}

async function pushInfraMetrics(): Promise<void> {
  if (!CLUSTER_URL) return;
  const history = getInfraHistory().slice(-10);
  if (history.length === 0) return;
  try {
    const res = await request(`${CLUSTER_URL}/api/v1/cluster/infra-metrics`, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ nodeId: NODE_ID, history, ts: Date.now() }),
      bodyTimeout: 5_000,
    });
    if (res.statusCode < 300) {
      _stats.metricPushes++;
    } else {
      await res.body.dump();
    }
  } catch { _stats.errors++; }
}

async function doSyncCycle(): Promise<void> {
  _stats.cycles++;
  await Promise.allSettled([ pushFixes(), pushPatternStats(), pushInfraMetrics() ]);
}

// ── Public API ────────────────────────────────────────────────────────────────

export function startSyncLoop(): void {
  if (_syncInterval) return;
  _syncInterval = setInterval(() => { void doSyncCycle(); }, SYNC_INT);
}

export function stopSyncLoop(): void {
  if (_syncInterval) { clearInterval(_syncInterval); _syncInterval = null; }
}

export function syncStats() { return { ..._stats }; }
