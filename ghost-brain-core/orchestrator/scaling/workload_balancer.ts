/**
 * GhostBrain Global Orchestrator — Workload Balancer
 *
 * Selects the optimal GhostNode for a given WorkloadRequest, applying:
 *   1. Role and optional chainId filtering.
 *   2. Health filter (healthy nodes only).
 *   3. Latency cap (WorkloadRequest.maxLatencyMs).
 *   4. Headroom filter (WorkloadRequest.minHeadroomPct).
 *   5. Final scoring: lowest load (with 5% hysteresis), then lowest latency.
 *
 * Returns a RoutingDecision that includes the selected node and rationale.
 * Returns null when no candidate satisfies all constraints.
 */

import { randomUUID } from "crypto";
import type { GhostNode, WorkloadRequest, RoutingDecision } from "../types.js";
import type { NodeRegistry }                                 from "../discovery/node_registry.js";

// ---------------------------------------------------------------------------
// WorkloadBalancer
// ---------------------------------------------------------------------------

export class WorkloadBalancer {
  constructor(private readonly registry: NodeRegistry) {}

  /**
   * Select the best node for a workload.
   * @param req    Workload constraints.
   * @param region Optional: restrict to a specific region.
   */
  balance(req: WorkloadRequest, region?: string): RoutingDecision | null {
    const now  = Date.now();
    let nodes: GhostNode[] = region
      ? this.registry.getByRegionAndRole(region, req.role)
      : this.registry.getByRole(req.role);

    // --- Filter: healthy only ---
    nodes = nodes.filter(n => n.status === "healthy");

    // --- Filter: chainId match ---
    if (req.chainId !== undefined) {
      nodes = nodes.filter(n => n.chainId === req.chainId);
    }

    // --- Filter: latency cap ---
    if (req.maxLatencyMs !== undefined) {
      nodes = nodes.filter(n => n.latencyMs <= req.maxLatencyMs!);
    }

    // --- Filter: headroom ---
    if (req.minHeadroomPct !== undefined) {
      const minHeadroom = req.minHeadroomPct;
      nodes = nodes.filter(n => (100 - n.loadPct) >= minHeadroom);
    }

    if (nodes.length === 0) return null;

    // --- Score: lowest load then lowest latency ---
    nodes.sort((a, b) => {
      const loadDiff = a.loadPct - b.loadPct;
      if (Math.abs(loadDiff) > 5) return loadDiff;
      return a.latencyMs - b.latencyMs;
    });

    const winner = nodes[0]!;

    return {
      requestId:      randomUUID(),
      selectedNodeId: winner.id,
      selectedRegion: winner.region,
      latencyMs:      winner.latencyMs,
      reason:
        `selected ${winner.role} node in ${winner.region}: ` +
        `load=${winner.loadPct}% latency=${winner.latencyMs}ms`,
      decidedAt: now,
    };
  }

  /**
   * Return a ranked list of all healthy nodes for a role across all regions.
   * Useful for diagnostic endpoints.
   */
  ranked(req: WorkloadRequest): GhostNode[] {
    const nodes = this.registry.getByRole(req.role)
      .filter(n => n.status === "healthy");

    return [...nodes].sort((a, b) => {
      const loadDiff = a.loadPct - b.loadPct;
      if (Math.abs(loadDiff) > 5) return loadDiff;
      return a.latencyMs - b.latencyMs;
    });
  }
}
