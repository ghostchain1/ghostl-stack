/**
 * GhostBrain Cluster — Memory & Infra Sync
 *
 * Only the leader node runs sync.
 * Periodically pushes aggregated cluster state to:
 *  → ghostbrain-memory (federated AI memory)
 *  → ghostbrain-infra  (infrastructure controller) if overload detected
 */

import { request }          from "undici";
import { isLeader }         from "./cluster_consensus.js";
import { getAgentNodes, getClusterSummary } from "./cluster_node.js";

const MEMORY_URL      = process.env.MEMORY_URL   ?? "";
const INFRA_URL       = process.env.INFRA_URL     ?? "";
const SYNC_INTERVAL   = Number(process.env.SYNC_INTERVAL_MS ?? "30_000".replace("_", ""));

const CPU_OVERLOAD_THRESHOLD  = 85;
const MEM_OVERLOAD_THRESHOLD  = 85;

let _syncTimer: ReturnType<typeof setInterval> | null = null;

// ── Push aggregate snapshot to ghostbrain-memory ──────────────────────────────

async function syncToMemory(): Promise<void> {
  if (!MEMORY_URL) return;
  const summary = getClusterSummary();
  const agents  = getAgentNodes();

  const events = agents.map(a => ({
    nodeId: a.nodeId,
    type:   "metric_snapshot",
    data:   { metrics: a.metrics, vmCount: a.vmCount, containerCount: a.containerCount },
    ts:     Date.now(),
  }));

  try {
    await request(`${MEMORY_URL}/api/v1/memory/cluster-ingest`, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ clusterSummary: summary, events }),
      bodyTimeout: 8_000,
    });
  } catch { /* non-fatal — memory service may not be up */ }
}

// ── Push rebalance signal to ghostbrain-infra if overloaded ──────────────────

async function syncToInfra(): Promise<void> {
  if (!INFRA_URL) return;
  const summary = getClusterSummary();
  if (summary.maxCpuPercent < CPU_OVERLOAD_THRESHOLD && summary.maxMemPercent < MEM_OVERLOAD_THRESHOLD) return;

  // Find overloaded nodes
  const overloaded = getAgentNodes().filter(a =>
    (a.metrics?.cpu.usagePercent  ?? 0) >= CPU_OVERLOAD_THRESHOLD ||
    (a.metrics?.memory.usagePercent ?? 0) >= MEM_OVERLOAD_THRESHOLD
  ).map(a => a.nodeId);

  try {
    await request(`${INFRA_URL}/api/v1/infra/rebalance`, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ overloadedNodes: overloaded, clusterSummary: summary, ts: Date.now() }),
      bodyTimeout: 8_000,
    });
  } catch { /* non-fatal */ }
}

async function syncCycle(): Promise<void> {
  if (!isLeader()) return; // only leader syncs
  await syncToMemory();
  await syncToInfra();
}

export function startSyncLoop(): void {
  if (_syncTimer) return;
  _syncTimer = setInterval(syncCycle, SYNC_INTERVAL);
}

export function stopSyncLoop(): void {
  if (_syncTimer) { clearInterval(_syncTimer); _syncTimer = null; }
}
