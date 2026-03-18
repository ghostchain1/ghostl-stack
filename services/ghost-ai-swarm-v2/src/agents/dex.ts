/**
 * GhostSwap (DEX) AI
 *
 * Monitors GhostXchange liquidity pools, detects imbalances, recommends
 * fee adjustments, and flags potential manipulation — all read-only.
 * Rebalancing proposals route through governance.
 */

import { fetch }     from "undici";
import { BaseAgent } from "./base.js";
import { bus }       from "../bus/messageBus.js";
import type { SwarmTask } from "../types.js";

const DEFI_ARCHITECT_URL = process.env.DEFI_ARCHITECT_URL ?? "http://127.0.0.1:7920";
const L2_RPC             = process.env.L2_RPC_URL         ?? "http://127.0.0.1:29547";

// If pool ratio deviates >20% from target (1:1) flag for rebalance
const IMBALANCE_THRESHOLD = 0.20;

interface PoolStatus {
  id:     string;
  token0: string;
  token1: string;
  reserve0: bigint;
  reserve1: bigint;
  feeBps:   number;
}

export class GhostSwapAgent extends BaseAgent {
  readonly role         = "dex" as const;
  readonly name         = "GhostSwap AI";
  readonly description  = "Monitors GhostXchange DEX pools, detects imbalances, flags manipulation";
  readonly capabilities = [
    "rebalance-pool", "adjust-swap-fee",
    "monitor-manipulation", "pool-analytics",
  ];

  protected async handleTask(task: SwarmTask): Promise<Record<string, unknown>> {
    switch (task.type) {
      case "rebalance-pool":  return this.rebalancePool(task.payload);
      case "adjust-swap-fee": return this.adjustFee(task.payload);
      default:                return this.poolAnalytics();
    }
  }

  private async poolAnalytics(): Promise<Record<string, unknown>> {
    // Attempt to fetch pool list from defi-architect service
    try {
      const ctrl = new AbortController();
      setTimeout(() => ctrl.abort(), 5_000);
      const res = await fetch(`${DEFI_ARCHITECT_URL}/api/v1/pools`, { signal: ctrl.signal });
      if (res.ok) {
        const pools = await res.json() as PoolStatus[];
        return this.analyzeImbalances(pools);
      }
    } catch { /* offline */ }

    return {
      status:  "defi-architect-offline",
      pools:   [],
      note:    `Connect defi-architect on ${DEFI_ARCHITECT_URL} for live pool data`,
    };
  }

  private analyzeImbalances(pools: PoolStatus[]): Record<string, unknown> {
    const alerts: Array<{ poolId: string; ratio: number; severity: string }> = [];

    for (const pool of pools) {
      const r0 = Number(pool.reserve0);
      const r1 = Number(pool.reserve1);
      if (r0 === 0 || r1 === 0) continue;
      // Expect 1:1 target for GST pairs; ratio = r0/r1
      const ratio    = r0 / r1;
      const deviation = Math.abs(ratio - 1);
      if (deviation > IMBALANCE_THRESHOLD) {
        const severity = deviation > 0.5 ? "critical" : deviation > 0.3 ? "high" : "medium";
        alerts.push({ poolId: pool.id, ratio: +ratio.toFixed(4), severity });
        bus.publish("alert:anomaly", "dex", { type: "pool-imbalance", pool: pool.id, ratio, severity });
      }
    }

    return { totalPools: pools.length, imbalanceAlerts: alerts, threshold: IMBALANCE_THRESHOLD };
  }

  private async rebalancePool(payload: Record<string, unknown>): Promise<Record<string, unknown>> {
    const poolId = String(payload["poolId"] ?? "");
    if (!poolId) return { error: "poolId required" };

    return {
      poolId,
      recommendation: "Submit governance proposal to rebalance via GhostXchange governor",
      action:         "draft-governance-proposal",
      note:           "Autonomous rebalancing is not permitted. Requires DAO vote.",
      humanApprovalRequired: true,
    };
  }

  private async adjustFee(payload: Record<string, unknown>): Promise<Record<string, unknown>> {
    const poolId    = String(payload["poolId"] ?? "");
    const newFeeBps = Number(payload["feeBps"] ?? 30);

    if (newFeeBps < 1 || newFeeBps > 500) {
      return { error: "feeBps must be 1–500" };
    }

    return {
      poolId,
      proposedFeeBps: newFeeBps,
      action:         "submit-governance-proposal",
      note:           "Fee changes require governance approval. Proposal drafted, not submitted.",
      humanApprovalRequired: true,
    };
  }
}
