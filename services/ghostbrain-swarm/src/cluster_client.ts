/**
 * GhostBrain Swarm — Cluster Node Load Client
 *
 * Polls ghostbrain-cluster's /api/v1/cluster/node-load endpoint on a
 * configurable interval and exposes a local in-memory cache so the swarm
 * task router can make load-aware routing decisions without blocking on
 * every task dispatch.
 *
 * The cache maps agentUrl → NodeLoad.  The swarm coordinator looks up each
 * candidate agent's URL in this map before scoring it for routing.
 *
 * Environment:
 *   CLUSTER_URL              — base URL of ghostbrain-cluster (e.g. http://127.0.0.1:7902)
 *   CLUSTER_LOAD_REFRESH_MS  — poll interval (default: 30 000 ms)
 */

import { fetch } from "undici";

const CLUSTER_URL  = process.env.CLUSTER_URL              ?? "";
const REFRESH_MS   = Number(process.env.CLUSTER_LOAD_REFRESH_MS ?? "30000");
const PROBE_TIMEOUT = 5_000;

// ── Types ─────────────────────────────────────────────────────────────────────

export interface NodeLoad {
  nodeId:         string;
  agentUrl:       string;
  cpuPercent:     number;
  memPercent:     number;
  /** Combined pressure score 0–100: (cpu + mem) / 2 */
  loadScore:      number;
  vmCount:        number;
  containerCount: number;
  lastSeen:       number;
}

// ── State ─────────────────────────────────────────────────────────────────────

/** Keyed by agentUrl for O(1) lookup by swarm router. */
let _cache: Map<string, NodeLoad> = new Map();
let _lastRefresh = 0;
let _refreshTimer: NodeJS.Timeout | undefined;

// ── Refresh ───────────────────────────────────────────────────────────────────

async function refreshNodeLoads(): Promise<void> {
  if (!CLUSTER_URL) return;
  try {
    const ctrl  = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), PROBE_TIMEOUT);
    const res   = await fetch(`${CLUSTER_URL}/api/v1/cluster/node-load`, { signal: ctrl.signal });
    clearTimeout(timer);

    if (!res.ok) return;

    const body = (await res.json()) as { nodes?: NodeLoad[] };
    if (!Array.isArray(body.nodes)) return;

    const next = new Map<string, NodeLoad>();
    for (const n of body.nodes) {
      if (n.agentUrl) next.set(n.agentUrl, n);
    }
    _cache       = next;
    _lastRefresh = Date.now();
  } catch { /* cluster may not be up — swarm falls back to task-count routing */ }
}

// ── Lifecycle ─────────────────────────────────────────────────────────────────

export function startClusterLoadSync(): void {
  if (_refreshTimer || !CLUSTER_URL) return;
  void refreshNodeLoads(); // immediate first fetch
  _refreshTimer = setInterval(refreshNodeLoads, REFRESH_MS);
}

export function stopClusterLoadSync(): void {
  if (_refreshTimer) {
    clearInterval(_refreshTimer);
    _refreshTimer = undefined;
  }
}

// ── Access ────────────────────────────────────────────────────────────────────

/**
 * Returns the cached load score for an agent URL, or 50 (neutral) if unknown.
 * Score is 0–100 where lower = less loaded.
 */
export function getLoadScore(agentUrl: string): number {
  const entry = _cache.get(agentUrl);
  if (entry) return entry.loadScore;

  // Try prefix matching (e.g. http://host:port vs http://host:port/extra)
  const origin = (() => {
    try { return new URL(agentUrl).origin; } catch { return ""; }
  })();
  if (origin) {
    for (const [url, n] of _cache) {
      try {
        if (new URL(url).origin === origin) return n.loadScore;
      } catch { /* skip malformed */ }
    }
  }

  return 50; // neutral default — no cluster data available
}

export function clusterLoadStats() {
  return {
    nodeCount:   _cache.size,
    lastRefresh: _lastRefresh,
    clusterUrl:  CLUSTER_URL || null,
  };
}
