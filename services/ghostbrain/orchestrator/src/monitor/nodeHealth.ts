/**
 * monitor/nodeHealth.ts — Polls GhostChain L1/L2/L3 via Ghost JSON-RPC.
 *
 * Security rules:
 *  - RPC namespace is `ghost_` — never `eth_`
 *  - AbortController timeout on every network call
 *  - No user-supplied URLs reach this layer; all endpoints come from config
 */

import { CHAIN_NODES, THRESHOLDS } from "../config.js";
import type { ChainHealth, ChainId, ChainLayer, OrchestratorNode, NodeStatus } from "../types.js";

// ── Internal helpers ──────────────────────────────────────────────────────────

type RpcResult = { result?: string; error?: { message: string } };

async function ghostRpc(
  endpoint: string,
  method: string,
  params: unknown[] = [],
): Promise<{ data: RpcResult | null; latencyMs: number }> {
  const start = Date.now();
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), THRESHOLDS.rpcTimeoutMs);

  try {
    const res = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
      signal: ac.signal,
    });
    const data: RpcResult = await res.json() as RpcResult;
    return { data, latencyMs: Date.now() - start };
  } catch {
    return { data: null, latencyMs: Date.now() - start };
  } finally {
    clearTimeout(timer);
  }
}

function hexToNumber(hex: string | undefined): number {
  if (!hex) return 0;
  return parseInt(hex, 16);
}

// ── Exported functions ────────────────────────────────────────────────────────

const CHAIN_ID_MAP: Record<ChainLayer, ChainId> = {
  l1: 14000101,
  l2: 901,
  l3: 903,
};

/**
 * Check the health of a single chain layer.
 * Uses `ghost_blockNumber` and `ghost_syncing` RPC methods.
 */
export async function checkChainHealth(layer: ChainLayer): Promise<ChainHealth> {
  const endpoint = CHAIN_NODES[layer];
  const [blockRes, syncRes] = await Promise.all([
    ghostRpc(endpoint, "ghost_blockNumber"),
    ghostRpc(endpoint, "ghost_syncing"),
  ]);

  const blocked = blockRes.data === null;
  const blockNumber = blocked
    ? 0
    : hexToNumber(blockRes.data?.result as string | undefined);
  const syncing =
    blockRes.data?.result === undefined
      ? false
      : typeof syncRes.data?.result === "object" && syncRes.data?.result !== null;
  const latencyMs = blockRes.latencyMs;

  return {
    layer,
    chainId:     CHAIN_ID_MAP[layer],
    blockNumber,
    peers:       0,   // ghost_peerCount if available can be integrated later
    syncing,
    latencyMs,
    ok:          !blocked && blockNumber > 0,
    checkedAt:   Date.now(),
    error:       blocked ? "RPC unreachable" : undefined,
  };
}

/**
 * Poll health of all three layers (L1, L2, L3) concurrently.
 */
export async function checkAllChains(): Promise<ChainHealth[]> {
  const layers: ChainLayer[] = ["l1", "l2", "l3"];
  return Promise.all(layers.map(checkChainHealth));
}

/**
 * Build a normalised `OrchestratorNode` from a chain health result.
 */
export function chainHealthToNode(health: ChainHealth): OrchestratorNode {
  let status: NodeStatus = "unknown";
  if (health.ok && !health.syncing) status = "healthy";
  else if (health.ok && health.syncing) status = "degraded";
  else if (!health.ok) status = "offline";

  return {
    id:          health.layer,
    role:        health.layer,
    endpoint:    CHAIN_NODES[health.layer],
    status,
    latencyMs:   health.latencyMs,
    blockNumber: health.blockNumber,
    lastChecked: health.checkedAt,
    error:       health.error,
  };
}
