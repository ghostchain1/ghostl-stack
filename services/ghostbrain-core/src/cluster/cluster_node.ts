/**
 * GhostBrain Core — Cluster Layer (peer registry)
 *
 * Core-internal cluster node registry. Maintains the known set of
 * ghostbrain-cluster coordinator peers and ghostbrain-agent reporters.
 * Thin integration layer — actual gossip runs in the ghostbrain-cluster
 * microservice, but core tracks a local view of cluster health.
 */

import { request } from "undici";

const CLUSTER_URL   = process.env.CLUSTER_URL ?? "";
const SELF_CORE_URL = process.env.GHOSTBRAIN_CORE_URL ?? "http://127.0.0.1:7900";
const NODE_ID       = `ghostbrain-core-${process.env.HOSTNAME ?? "local"}`;

// ── Types ─────────────────────────────────────────────────────────────────────

export interface ClusterPeer {
  nodeId:    string;
  url:       string;
  role:      "cluster" | "agent" | "core";
  lastSeen:  number;
  cpuPercent?: number;
  memPercent?: number;
}

// ── State ─────────────────────────────────────────────────────────────────────

const _peers = new Map<string, ClusterPeer>();
const STALE_MS = 90_000;  // peers not seen in 90s are pruned

// ── Helpers ───────────────────────────────────────────────────────────────────

function pruneStale(): void {
  const cutoff = Date.now() - STALE_MS;
  for (const [id, peer] of _peers) {
    if (peer.lastSeen < cutoff) _peers.delete(id);
  }
}

// ── Public API ────────────────────────────────────────────────────────────────

export function upsertPeer(peer: ClusterPeer): void {
  _peers.set(peer.nodeId, peer);
}

export function getPeers(): ClusterPeer[] {
  pruneStale();
  return [..._peers.values()];
}

export function getActivePeerCount(): number {
  pruneStale();
  return _peers.size;
}

/** Fetch cluster summary from the coordinator service. */
export async function fetchClusterSummary(): Promise<{
  leaderNodeId: string | null;
  agentCount: number;
  avgCpu: number;
  avgMem: number;
} | null> {
  if (!CLUSTER_URL) return null;
  try {
    const res = await request(`${CLUSTER_URL}/api/v1/cluster/status`, {
      method:      "GET",
      bodyTimeout: 5_000,
    });
    if (res.statusCode !== 200) return null;
    const j = await res.body.json() as {
      leader?: string;
      summary?: { agentCount?: number; avgCpu?: number; avgMem?: number };
    };
    return {
      leaderNodeId: j.leader ?? null,
      agentCount:   j.summary?.agentCount ?? 0,
      avgCpu:       j.summary?.avgCpu     ?? 0,
      avgMem:       j.summary?.avgMem     ?? 0,
    };
  } catch {
    return null;
  }
}

/** Announce this core instance to the cluster coordinator. */
export async function announceToCluster(): Promise<void> {
  if (!CLUSTER_URL) return;
  try {
    await request(`${CLUSTER_URL}/api/v1/cluster/agent-report`, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ nodeId: NODE_ID, agentUrl: SELF_CORE_URL, vmCount: 0, containerCount: 0, ts: Date.now() }),
      bodyTimeout: 6_000,
    });
  } catch { /* cluster may not be available */ }
}
