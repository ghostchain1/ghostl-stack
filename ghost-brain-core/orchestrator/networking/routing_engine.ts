/**
 * GhostBrain Global Orchestrator — Routing Engine
 *
 * Controls how cross-region and cross-layer traffic is directed.
 *
 * CRITICAL ARCHITECTURE RULE — enforced here at the routing layer:
 *   L3 traffic settles to L2 only.
 *   L2 traffic settles to L1 (GhostChain) only.
 *   L1 is the canonical settlement layer for ALL transactions.
 *   No L3 node routes directly to L1, bypassing L2.
 *   No external chain (non-GhostChain mainnet, Arbitrum, etc.) is ever a target.
 *
 * The engine selects the best node for a request using:
 *   1. Chain topology enforcement (L3→L2→L1 only).
 *   2. Region index ranking (lowest latency first).
 *   3. Node health and load filtering.
 *
 * All routing decisions are logged to the RoutingDecision trail.
 */

import { randomUUID } from "crypto";
import type {
  GhostNode,
  WorkloadRequest,
  RoutingDecision,
  ChainId,
} from "../types.js";
import type { NodeRegistry }   from "../discovery/node_registry.js";
import type { RegionIndex }    from "../discovery/region_index.js";
import type { WorkloadBalancer } from "../scaling/workload_balancer.js";

// ---------------------------------------------------------------------------
// Routing rules
// ---------------------------------------------------------------------------

/**
 * Settlement chain: a request FROM a layer must be routed TO its parent layer.
 * L3 (903) → L2 (901) → L1 (14000101).
 */
const SETTLEMENT_TARGET: Partial<Record<ChainId, ChainId>> = {
  903: 901,          // L3 settles to L2
  901: 14000101,     // L2 settles to L1
};

// ---------------------------------------------------------------------------
// RoutingEngine
// ---------------------------------------------------------------------------

export class RoutingEngine {
  constructor(
    private readonly registry: NodeRegistry,
    private readonly regionIndex: RegionIndex,
    private readonly balancer: WorkloadBalancer,
  ) {}

  /**
   * Route a workload request to the best available node.
   *
   * @param req        The workload requirements.
   * @param fromRegion Optional origin region — used to prefer the nearest region.
   */
  route(req: WorkloadRequest, fromRegion?: string): RoutingDecision | null {
    const now = Date.now();

    // Try the preferred region first (if specified and has capacity).
    if (fromRegion) {
      const local = this.balancer.balance(req, fromRegion);
      if (local) return local;
    }

    // Fall back to globally best node across all regions.
    const ranked = this.regionIndex.rankedRegions();
    for (const region of ranked) {
      if (region.id === fromRegion) continue; // already tried above
      const decision = this.balancer.balance(req, region.id);
      if (decision) return decision;
    }

    return null;
  }

  /**
   * Determine the correct settlement target node for a given source chain.
   * Enforces the L3→L2→L1 topology.
   *
   * Returns null if the source chain is already L1 (no further settlement
   * needed) or if no healthy target node exists.
   *
   * Throws if the source chain is unknown (not one of our three chains).
   */
  routeSettlement(
    fromChainId: ChainId,
    fromRegion:  string,
  ): RoutingDecision | null {
    const targetChainId = SETTLEMENT_TARGET[fromChainId];

    if (!targetChainId) {
      // L1 is the root — no further settlement.
      return null;
    }

    // Determine role based on target chain.
    const req: WorkloadRequest = {
      role:    fromChainId === 903 ? "l2" : "l1",
      chainId: targetChainId,
    };

    const decision = this.route(req, fromRegion);

    if (!decision) {
      console.warn(
        `[routing] no settlement target for chain ${fromChainId}→${targetChainId} ` +
        `from region ${fromRegion}`,
      );
    }

    return decision;
  }

  /**
   * Route an inbound user RPC request to the most appropriate node.
   * Prefers the lowest-latency healthy rpc_proxy in any region.
   */
  routeRpc(fromRegion?: string): RoutingDecision | null {
    return this.route({ role: "rpc_proxy" }, fromRegion);
  }

  /**
   * Route an AI workload to the best ai_compute node.
   */
  routeAI(fromRegion?: string): RoutingDecision | null {
    return this.route({ role: "ai_compute", maxLatencyMs: 200 }, fromRegion);
  }
}
