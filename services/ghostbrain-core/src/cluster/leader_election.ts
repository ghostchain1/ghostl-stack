/**
 * GhostBrain Core — Leader Election (thin client)
 *
 * Queries the ghostbrain-cluster coordinator for the current elected leader.
 * Caches the result for CACHE_MS to avoid hammering the coordinator.
 * The kernel/brain.ts uses isClusterLeader() to gate cluster-wide actions
 * (e.g. global rebalancing, federation proposals) to a single node.
 */

import { request } from "undici";

const CLUSTER_URL = process.env.CLUSTER_URL ?? "";
const CACHE_MS    = Number(process.env.LEADER_CACHE_MS ?? "5000");
const NODE_ID     = `ghostbrain-core-${process.env.HOSTNAME ?? "local"}`;

interface LeaderInfo {
  leaderId:    string | null;
  leaderUrl:   string | null;
  checkedAt:   number;
}

let _cache: LeaderInfo = { leaderId: null, leaderUrl: null, checkedAt: 0 };

// ── Internal ──────────────────────────────────────────────────────────────────

async function fetchLeader(): Promise<void> {
  if (!CLUSTER_URL) return;
  try {
    const res = await request(`${CLUSTER_URL}/api/v1/cluster/leader`, {
      method: "GET", bodyTimeout: 4_000,
    });
    if (res.statusCode === 200) {
      const j = await res.body.json() as {
        leaderId?: string; leaderUrl?: string;
        nodeId?: string; url?: string;
      };
      _cache = {
        leaderId:  j.leaderId ?? j.nodeId ?? null,
        leaderUrl: j.leaderUrl ?? j.url ?? null,
        checkedAt: Date.now(),
      };
    } else {
      await res.body.dump();
    }
  } catch {
    _cache.checkedAt = Date.now(); // back-off even on error
  }
}

async function ensureFresh(): Promise<void> {
  if (Date.now() - _cache.checkedAt > CACHE_MS) await fetchLeader();
}

// ── Public API ────────────────────────────────────────────────────────────────

export async function isClusterLeader(): Promise<boolean> {
  await ensureFresh();
  return !!_cache.leaderId && _cache.leaderId === NODE_ID;
}

export async function getCurrentLeader(): Promise<string | null> {
  await ensureFresh();
  return _cache.leaderId;
}

export async function leaderStats(): Promise<{
  isLeader:      boolean;
  leaderId:      string | null;
  leaderUrl:     string | null;
  lastCheckedAt: number;
}> {
  await ensureFresh();
  return {
    isLeader:      _cache.leaderId === NODE_ID,
    leaderId:      _cache.leaderId,
    leaderUrl:     _cache.leaderUrl,
    lastCheckedAt: _cache.checkedAt,
  };
}

/** Force a cache refresh immediately (useful at startup). */
export async function refreshLeader(): Promise<void> {
  _cache.checkedAt = 0;
  await fetchLeader();
}
