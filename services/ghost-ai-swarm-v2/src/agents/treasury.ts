/**
 * GhostTreasury AI
 *
 * Manages GhostChain L1 treasury: liquidity allocation, yield optimization,
 * market making, cross-chain investments.
 */

import { fetch }     from "undici";
import { BaseAgent } from "./base.js";
import { bus }       from "../bus/messageBus.js";
import type { SwarmTask } from "../types.js";

const TREASURY_ENGINE_URL = process.env.TREASURY_ENGINE_URL ?? "http://127.0.0.1:7683";
const GHOSTBRAIN_URL      = process.env.GHOSTBRAIN_URL       ?? "http://127.0.0.1:7900";

// Allocation targets (basis points, sum = 10000)
const ALLOCATION_POLICY = {
  liquidityReserve: 4_000,   // 40% — L1 liquidity reserve
  yieldStrategies:  3_000,   // 30% — GhostYield strategies
  operationalFund:  2_000,   // 20% — ops, salaries, grants
  insuranceFund:    1_000,   // 10% — circuit-breaker reserve
} as const;

export class GhostTreasuryAgent extends BaseAgent {
  readonly role         = "treasury" as const;
  readonly name         = "GhostTreasury AI";
  readonly description  = "Manages treasury liquidity allocation, yield optimization, and cross-chain investments";
  readonly capabilities = [
    "allocate-liquidity", "optimize-yield",
    "market-making", "cross-chain-investment", "treasury-report",
  ];

  protected async handleTask(task: SwarmTask): Promise<Record<string, unknown>> {
    switch (task.type) {
      case "allocate-liquidity": return this.allocateLiquidity(task.payload);
      case "optimize-yield":     return this.optimizeYield(task.payload);
      default:                   return this.treasuryReport();
    }
  }

  private async treasuryReport(): Promise<Record<string, unknown>> {
    const result = await this.callTreasuryEngine("/status");
    if (result !== null) return result;

    return {
      policy:       ALLOCATION_POLICY,
      status:       "allocation-policy-active",
      totalValueGST: "unknown — treasury-engine offline",
      note:         `Connect treasury-engine on ${TREASURY_ENGINE_URL} for live data`,
    };
  }

  private async allocateLiquidity(payload: Record<string, unknown>): Promise<Record<string, unknown>> {
    const totalGST = Number(payload["totalGST"] ?? 0);

    const allocation = Object.fromEntries(
      Object.entries(ALLOCATION_POLICY).map(([key, bps]) => [
        key, { bps, amount: Math.floor(totalGST * bps / 10_000), pct: bps / 100 },
      ])
    );

    // Notify GhostBrain about allocation decision
    void this.notifyGhostBrain("treasury:allocation", { totalGST, allocation });

    return { totalGST, allocation, policy: "ALLOCATION_POLICY_V1", humanApprovalRequired: totalGST > 1e6 };
  }

  private async optimizeYield(payload: Record<string, unknown>): Promise<Record<string, unknown>> {
    const strategies = payload["strategies"] as Array<{ name: string; apy: number; tvl: number }> | undefined;
    if (!strategies?.length) {
      return { recommendation: "No strategies provided. Connect GhostYield for strategy data." };
    }

    // Sort by risk-adjusted APY (simple: APY / ln(TVL+1))
    const scored = strategies
      .map(s => ({ ...s, score: s.apy / Math.max(1, Math.log(s.tvl + 1)) }))
      .sort((a, b) => b.score - a.score);

    bus.publish("workflow:step", "treasury", { step: "yield-optimized", topStrategy: scored[0]?.name });

    return {
      recommended: scored[0],
      ranked:      scored,
      note:        "Risk-adjusted yield scoring applied. Review before rebalancing.",
    };
  }

  private async callTreasuryEngine(path: string): Promise<Record<string, unknown> | null> {
    try {
      const ctrl = new AbortController();
      setTimeout(() => ctrl.abort(), 5_000);
      const res = await fetch(`${TREASURY_ENGINE_URL}${path}`, { signal: ctrl.signal });
      if (res.ok) return await res.json() as Record<string, unknown>;
    } catch { /* offline */ }
    return null;
  }

  private async notifyGhostBrain(event: string, data: unknown): Promise<void> {
    try {
      const { fetch: f } = await import("undici");
      const ctrl = new AbortController();
      setTimeout(() => ctrl.abort(), 3_000);
      await f(`${GHOSTBRAIN_URL}/api/v1/signals`, {
        method:  "POST",
        headers: { "content-type": "application/json" },
        body:    JSON.stringify({ event, data }),
        signal:  ctrl.signal,
      });
    } catch { /* ghostbrain offline — continue */ }
  }
}
