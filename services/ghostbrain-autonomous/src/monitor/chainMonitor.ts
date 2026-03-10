/**
 * Chain Monitor (Phase 44)
 *
 * DETECT-ONLY — never calls write APIs.
 *
 * Checks L1 / L2 / L3 chain health via the network topology BFF.
 * Raises proposals when a chain head is stale or the chain reports
 * an unhealthy status.
 *
 * Routing law reminder: only GhostChain L1 talks to the outside world.
 * This monitor only reads internal BFF data — it does not call external RPCs.
 */

import { CONFIG, RULES } from "../config/rules.js";
import type { Proposal } from "../types.js";

let fetchFn: typeof fetch;

async function getFetch() {
  if (fetchFn) return fetchFn;
  if (typeof globalThis.fetch === "function") {
    fetchFn = globalThis.fetch;
  }
  return fetchFn;
}

function makeId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

interface ChainNode {
  id:              string;
  label:           string;
  layer:           "L1" | "L2" | "L3";
  status:          "online" | "degraded" | "offline";
  blockNumber?:    number;
  blockTimestamp?: number;  // unix ms
  peerCount?:      number;
}

interface TopologyResponse {
  nodes: ChainNode[];
  timestamp: string;
}

/**
 * Inspect chain topology and return proposals for stale or unhealthy chains.
 */
export async function monitorChains(): Promise<Proposal[]> {
  const proposals: Proposal[] = [];
  const now     = new Date().toISOString();
  const nowMs   = Date.now();

  let topology: TopologyResponse;
  try {
    const f  = await getFetch();
    const r  = await f(`${CONFIG.apiBase}/api/network/topology`, { signal: AbortSignal.timeout(8_000) });
    topology = await r.json() as TopologyResponse;
  } catch (err) {
    console.warn("[chainMonitor] fetch failed:", (err as Error).message);
    return proposals;
  }

  const chains = (topology.nodes ?? []).filter(n => ["L1","L2","L3"].includes(n.layer));

  for (const chain of chains) {
    const label = chain.label ?? chain.id;

    // Chain not healthy
    if (chain.status !== "online") {
      proposals.push({
        id: makeId(), type: "alert_chain_stale",
        kernelType: "alert", action: "alert", target: label,
        severity: chain.status === "offline" ? "critical" : "warning",
        reason: `Chain "${label}" status: ${chain.status}`,
        payload: { chainId: chain.id, layer: chain.layer, status: chain.status },
        createdAt: now, status: "pending", source: "chainMonitor",
      });
    }

    // Block head staleness
    if (chain.blockTimestamp != null) {
      const ageMs = nowMs - chain.blockTimestamp;
      if (ageMs > RULES.chainBlockStaleMs) {
        proposals.push({
          id: makeId(), type: "alert_chain_stale",
          kernelType: "alert", action: "alert", target: label,
          severity: "critical",
          reason: `Chain "${label}" block head stale for ${Math.round(ageMs / 1000)}s (threshold: ${RULES.chainBlockStaleMs / 1000}s)`,
          payload: {
            chainId: chain.id, layer: chain.layer,
            blockNumber: chain.blockNumber, ageMs,
          },
          createdAt: now, status: "pending", source: "chainMonitor",
        });
      }
    }
  }

  return proposals;
}
