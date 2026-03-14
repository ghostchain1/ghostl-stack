/**
 * GhostBrain Core — Cluster Gossip (core-side)
 *
 * Core-side gossip loop: periodically fetches cluster topology from
 * the ghostbrain-cluster coordinator and updates the local peer registry.
 * Also broadcasts any core-generated insights (high crash-risk resources)
 * to the cluster so other agents can track them.
 */

import { request }        from "undici";
import { upsertPeer, fetchClusterSummary } from "./cluster_node.js";

const CLUSTER_URL     = process.env.CLUSTER_URL         ?? "";
const GOSSIP_INT      = Number(process.env.GOSSIP_INTERVAL_MS ?? "15000");

let _gossipInterval: ReturnType<typeof setInterval> | null = null;

// ── Gossip cycle ──────────────────────────────────────────────────────────────

async function doGossipCycle(): Promise<void> {
  if (!CLUSTER_URL) return;

  // 1. Fetch current node list from cluster
  try {
    const res = await request(`${CLUSTER_URL}/api/v1/cluster/nodes`, {
      method: "GET", bodyTimeout: 5_000,
    });
    if (res.statusCode === 200) {
      const j = await res.body.json() as {
        agents?: { nodeId: string; agentUrl: string; cpuPercent?: number; memPercent?: number; lastSeenMs?: number }[];
        peers?:  { nodeId: string; url: string; lastSeen?: number }[];
      };
      const now = Date.now();
      for (const a of (j.agents ?? [])) {
        upsertPeer({
          nodeId:     a.nodeId,
          url:        a.agentUrl,
          role:       "agent",
          lastSeen:   a.lastSeenMs ?? now,
          cpuPercent: a.cpuPercent,
          memPercent: a.memPercent,
        });
      }
      for (const p of (j.peers ?? [])) {
        upsertPeer({ nodeId: p.nodeId, url: p.url, role: "cluster", lastSeen: p.lastSeen ?? now });
      }
    }
  } catch { /* coordinator unreachable — not fatal */ }
}

// ── Public API ────────────────────────────────────────────────────────────────

export function startGossip(): void {
  if (_gossipInterval) return;
  void doGossipCycle(); // immediate first run
  _gossipInterval = setInterval(() => { void doGossipCycle(); }, GOSSIP_INT);
}

export function stopGossip(): void {
  if (_gossipInterval) { clearInterval(_gossipInterval); _gossipInterval = null; }
}

/** Push a critical insight to the cluster coordinator. */
export async function pushInsight(insight: {
  type:       string;
  resourceId: string;
  detail:     string;
  score?:     number;
}): Promise<void> {
  if (!CLUSTER_URL) return;
  try {
    await request(`${CLUSTER_URL}/api/v1/cluster/agent-report`, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({
        nodeId:         `ghostbrain-core-${process.env.HOSTNAME ?? "local"}`,
        agentUrl:       process.env.GHOSTBRAIN_CORE_URL ?? "",
        insight,
        ts:             Date.now(),
      }),
      bodyTimeout: 4_000,
    });
  } catch { /* non-fatal */ }
}

export { fetchClusterSummary };
