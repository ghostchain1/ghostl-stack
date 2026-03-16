/**
 * orchestrator/blockchainManager.ts — Blockchain-level health coordination.
 *
 * Aggregates chain health from nodeHealth, detects block lag between layers,
 * and produces cross-chain health reports.  No on-chain writes are made here.
 */

import { checkAllChains } from "../monitor/nodeHealth.js";
import type { ChainHealth, ChainLayer, OrchestratorNode } from "../types.js";
import { chainHealthToNode } from "../monitor/nodeHealth.js";
import { THRESHOLDS } from "../config.js";

// ── State ─────────────────────────────────────────────────────────────────────

let _lastChains: ChainHealth[] = [];
let _lastNodes:  OrchestratorNode[] = [];

// ── Exported functions ────────────────────────────────────────────────────────

/**
 * Refresh chain health for all layers.  Call periodically.
 */
export async function refreshChainHealth(): Promise<{
  chains: ChainHealth[];
  nodes:  OrchestratorNode[];
}> {
  const chains = await checkAllChains();
  const nodes  = chains.map(chainHealthToNode);

  _lastChains = chains;
  _lastNodes  = nodes;

  return { chains, nodes };
}

/**
 * Return the most-recently cached chain health snapshot.
 */
export function getCachedChainHealth(): { chains: ChainHealth[]; nodes: OrchestratorNode[] } {
  return { chains: _lastChains, nodes: _lastNodes };
}

/**
 * Check whether L2 block number is lagging behind L1 beyond the threshold.
 * Returns true when the lag is acceptable.
 */
export function isL2Synced(chains: ChainHealth[]): boolean {
  const l1 = chains.find((c) => c.layer === "l1");
  const l2 = chains.find((c) => c.layer === "l2");
  if (!l1 || !l2) return false;
  const lag = l1.blockNumber - l2.blockNumber;
  return lag <= THRESHOLDS.maxBlockLag;
}

/**
 * Check whether L3 block number is lagging behind L2 beyond the threshold.
 */
export function isL3Synced(chains: ChainHealth[]): boolean {
  const l2 = chains.find((c) => c.layer === "l2");
  const l3 = chains.find((c) => c.layer === "l3");
  if (!l2 || !l3) return false;
  const lag = l2.blockNumber - l3.blockNumber;
  return lag <= THRESHOLDS.maxBlockLag;
}

/**
 * Returns a human-readable sync-lag report for all layer pairs.
 */
export function syncLagReport(chains: ChainHealth[]): Record<string, number> {
  const get = (l: ChainLayer): number =>
    chains.find((c) => c.layer === l)?.blockNumber ?? 0;

  return {
    l1_l2_lag:  Math.max(0, get("l1") - get("l2")),
    l2_l3_lag:  Math.max(0, get("l2") - get("l3")),
  };
}
