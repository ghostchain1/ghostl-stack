/**
 * GhostBrain Global Orchestrator — Cluster Allocator
 *
 * Given an AllocationRequest (region + required roles + minimum count),
 * selects a set of healthy GhostNodes from the NodeRegistry that best
 * satisfies the request.
 *
 * Selection criteria (descending priority):
 *   1. Status is "healthy".
 *   2. Role matches a required role.
 *   3. Lowest loadPct first (most headroom).
 *   4. Lowest latencyMs as tiebreaker.
 *
 * Returns an AllocationResult that includes any roles that could not be
 * satisfied due to insufficient healthy capacity.
 */

import type {
  GhostNode,
  NodeRole,
  AllocationRequest,
  AllocationResult,
} from "../types.js";
import type { NodeRegistry } from "../discovery/node_registry.js";

// ---------------------------------------------------------------------------
// ClusterAllocator
// ---------------------------------------------------------------------------

export class ClusterAllocator {
  constructor(private readonly registry: NodeRegistry) {}

  /**
   * Attempt to allocate nodes for the given request.
   * Healthy nodes are scored by load then latency.
   */
  allocate(req: AllocationRequest): AllocationResult {
    const now           = Date.now();
    const allocated:    GhostNode[] = [];
    const missingRoles: NodeRole[]  = [];

    for (const role of req.requiredRoles) {
      const candidates = this.registry
        .getByRegionAndRole(req.region, role)
        .filter(n => n.status === "healthy")
        .sort(scoreNode);

      if (candidates.length === 0) {
        missingRoles.push(role);
        continue;
      }

      // Take up to minCount nodes per role for redundancy.
      const take = candidates.slice(0, req.minCount);
      allocated.push(...take);
    }

    return {
      region:         req.region,
      allocatedNodes: allocated,
      missingRoles,
      satisfiedAt:    now,
    };
  }

  /**
   * Return the single best node for a role/region pair.
   * Returns null if no healthy candidates exist.
   */
  best(region: string, role: NodeRole): GhostNode | null {
    const candidates = this.registry
      .getByRegionAndRole(region, role)
      .filter(n => n.status === "healthy")
      .sort(scoreNode);

    return candidates[0] ?? null;
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Lower score = better candidate (less load, less latency). */
function scoreNode(a: GhostNode, b: GhostNode): number {
  const loadDiff = a.loadPct - b.loadPct;
  if (Math.abs(loadDiff) > 5) return loadDiff; // 5% hysteresis band
  return a.latencyMs - b.latencyMs;
}
