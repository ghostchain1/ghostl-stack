/**
 * GhostBrain Global Orchestrator — Failover Manager
 *
 * Detects regional node failures and coordinates recovery:
 *
 *   1. Identifies offline nodes using NodeRegistry data.
 *   2. Promotes the best healthy replica in the same region (if available).
 *   3. Reroutes traffic via RoutingEngine when no local replica exists.
 *   4. Submits a governance proposal to the signing relay for cases that
 *      require human intervention (e.g. full region loss).
 *
 * INVARIANTS
 * ----------
 * - No exec() or shell calls.
 * - No autonomous on-chain transactions.
 * - All recovery decisions that affect chain state (e.g. promoting a
 *   validator) require governance relay submission.
 * - fetch() calls have AbortController timeouts.
 */

import { randomUUID } from "crypto";
import type {
  GhostNode,
  FailoverEvent,
  FailoverStrategy,
} from "../types.js";
import type { NodeRegistry }  from "../discovery/node_registry.js";
import type { RoutingEngine } from "./routing_engine.js";

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const SIGNING_RELAY_URL = (
  process.env["SIGNING_RELAY_URL"] ?? "http://localhost:7910"
).replace(/\/$/, "");

const RELAY_TIMEOUT_MS = parseInt(
  process.env["FAILOVER_RELAY_TIMEOUT_MS"] ?? "8000", 10,
);

/** Ratio of offline nodes in a region that triggers a full-region failover. */
const FULL_REGION_FAILURE_RATIO = parseFloat(
  process.env["FAILOVER_FULL_REGION_RATIO"] ?? "0.6",
);

// ---------------------------------------------------------------------------
// FailoverManager
// ---------------------------------------------------------------------------

export class FailoverManager {
  constructor(
    private readonly registry: NodeRegistry,
    private readonly router:   RoutingEngine,
  ) {}

  /**
   * Evaluate all registered nodes.  For each offline node, attempt recovery.
   * Returns a list of FailoverEvents that document the actions taken.
   */
  async evaluate(): Promise<FailoverEvent[]> {
    const events: FailoverEvent[]       = [];
    const offlineNodes: GhostNode[]     = this.registry
      .getAll()
      .filter(n => n.status === "offline");

    if (offlineNodes.length === 0) return [];

    // Check for full-region failure.
    const offlineByRegion = groupByRegion(offlineNodes);
    for (const [regionId, offline] of offlineByRegion) {
      const total = this.registry.getByRegion(regionId).length;
      if (total > 0 && offline.length / total >= FULL_REGION_FAILURE_RATIO) {
        const event = await this.handleRegionFailure(regionId, offline);
        events.push(event);
      }
    }

    // Per-node recovery for non-full-region failures.
    for (const node of offlineNodes) {
      // Check if this region was already handled above.
      const regionOffline = offlineByRegion.get(node.region) ?? [];
      const total         = this.registry.getByRegion(node.region).length;
      if (total > 0 && regionOffline.length / total >= FULL_REGION_FAILURE_RATIO) {
        continue; // already handled at region level
      }

      const event = await this.handleNodeFailure(node);
      events.push(event);
    }

    return events;
  }

  // -------------------------------------------------------------------------
  // Node-level failover
  // -------------------------------------------------------------------------

  private async handleNodeFailure(offline: GhostNode): Promise<FailoverEvent> {
    const now = Date.now();

    // Find the healthiest sibling with the same role in the same region.
    const replica = this.registry
      .getByRegionAndRole(offline.region, offline.role)
      .filter(n => n.id !== offline.id && n.status === "healthy")
      .sort((a, b) => a.loadPct - b.loadPct)[0];

    if (replica) {
      // Promote replica — for chain nodes, submit governance proposal.
      const needsGovernance = ["l1", "l2", "l3", "validator"].includes(offline.role);
      if (needsGovernance) {
        await this.submitRelayProposal("promote_replica", offline, replica);
      }

      return {
        region:          offline.region,
        offlineNodeId:   offline.id,
        strategy:        "promote_replica",
        promotedNodeId:  replica.id,
        triggeredAt:     now,
      };
    }

    // No local replica: reroute to another region.
    const decision = this.router.route(
      { role: offline.role, chainId: offline.chainId },
      offline.region,
    );

    if (decision) {
      return {
        region:         offline.region,
        offlineNodeId:  offline.id,
        strategy:       "reroute_traffic",
        triggeredAt:    now,
      };
    }

    // Last resort: submit governance proposal — no automatic action.
    await this.submitRelayProposal("governance_propose", offline);

    return {
      region:         offline.region,
      offlineNodeId:  offline.id,
      strategy:       "governance_propose",
      triggeredAt:    now,
    };
  }

  // -------------------------------------------------------------------------
  // Region-level failover
  // -------------------------------------------------------------------------

  private async handleRegionFailure(
    regionId: string,
    offlineNodes: GhostNode[],
  ): Promise<FailoverEvent> {
    const now = Date.now();
    console.error(
      `[failover] REGION FAILURE: ${regionId} — ${offlineNodes.length} nodes offline`,
    );

    await this.submitRelayProposal("governance_propose", {
      id:     `region-${regionId}`,
      role:   "l1",
      region: regionId,
    });

    return {
      region:         regionId,
      offlineNodeId:  `region:${regionId}`,
      strategy:       "governance_propose",
      triggeredAt:    now,
    };
  }

  // -------------------------------------------------------------------------
  // Relay submission
  // -------------------------------------------------------------------------

  private async submitRelayProposal(
    strategy:   FailoverStrategy,
    offline:    Pick<GhostNode, "id" | "role" | "region">,
    promoted?:  Pick<GhostNode, "id">,
  ): Promise<void> {
    const ctl = new AbortController();
    const tid = setTimeout(() => ctl.abort(), RELAY_TIMEOUT_MS);

    try {
      await fetch(`${SIGNING_RELAY_URL}/relay/failover/propose`, {
        method:  "POST",
        signal:  ctl.signal,
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({
          proposal_id:       randomUUID(),
          strategy,
          offline_node_id:   offline.id,
          offline_node_role: offline.role,
          region:            offline.region,
          promoted_node_id:  promoted?.id,
          chain_id:          14000101,
          gas_token:         "GST",
          from:              "ghostbrain-failover",
        }),
      });
      clearTimeout(tid);
    } catch {
      clearTimeout(tid);
      // Non-fatal — governance proposal is advisory.
    }
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function groupByRegion(nodes: GhostNode[]): Map<string, GhostNode[]> {
  const m = new Map<string, GhostNode[]>();
  for (const n of nodes) {
    if (!m.has(n.region)) m.set(n.region, []);
    m.get(n.region)!.push(n);
  }
  return m;
}
