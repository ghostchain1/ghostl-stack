/**
 * GhostLend AI
 *
 * Monitors lending protocol health (GhostLend.sol) — interest rate model,
 * liquidation risk, collateral health. All rate changes require governance.
 * Uses the same kink utilization model as GhostLend.sol.
 */

import { fetch }     from "undici";
import { BaseAgent } from "./base.js";
import { bus }       from "../bus/messageBus.js";
import type { SwarmTask } from "../types.js";

const L1_RPC             = process.env.L1_RPC_URL ?? "http://127.0.0.1:18545";
const GHOSTLEND_CONTRACT = process.env.GHOSTLEND_ADDRESS ?? "0x0000000000000000000000000000000000000000";

// Kink model constants (mirrors GhostLend.sol defaults)
const BASE_RATE_PER_SEC   = 317_097_919n;     // ~1% per year
const KINK_MULTIPLIER     = 1_585_489_599n;   // ~5% per year at kink
const JUMP_MULTIPLIER     = 31_709_791_983n;  // ~100% per year above kink
const KINK_UTILIZATION    = 800_000_000_000_000_000n; // 80% (1e18 = 100%)
const WAD                 = 1_000_000_000_000_000_000n;

// Liquidation risk threshold: HF < 1.1 → critical
const CRITICAL_HEALTH_FACTOR = 1.1;

export class GhostLendAgent extends BaseAgent {
  readonly role         = "lend" as const;
  readonly name         = "GhostLend AI";
  readonly description  = "Monitors interest rates, liquidation risk, and collateral health for GhostLend";
  readonly capabilities = [
    "adjust-rate", "check-liquidation",
    "collateral-health", "interest-rate-model",
  ];

  protected async handleTask(task: SwarmTask): Promise<Record<string, unknown>> {
    switch (task.type) {
      case "adjust-rate":        return this.computeRateRecommendation(task.payload);
      case "check-liquidation":  return this.checkLiquidationRisk(task.payload);
      default:                   return this.lendingReport();
    }
  }

  private async lendingReport(): Promise<Record<string, unknown>> {
    const utilization = await this.fetchUtilization();
    if (utilization === null) {
      return {
        status: "ghostlend-contract-unavailable",
        note:   `Deploy GhostLend and set GHOSTLEND_ADDRESS. RPC: ${L1_RPC}`,
      };
    }

    const rate = this.kinkModel(utilization);
    return {
      utilizationWad:   utilization.toString(),
      utilizationPct:   +(Number(utilization) / 1e16).toFixed(2),
      borrowRatePerSec: rate.toString(),
      borrowRateApy:    +(Number(rate) * 31_536_000 / 1e18).toFixed(4),
      model:            "kink-utilization-v1",
    };
  }

  private async computeRateRecommendation(payload: Record<string, unknown>): Promise<Record<string, unknown>> {
    const utilizationInput = payload["utilizationWad"]
      ? BigInt(String(payload["utilizationWad"]))
      : await this.fetchUtilization();

    if (utilizationInput === null) {
      return { error: "Cannot compute rate: utilization unavailable and not provided" };
    }

    const currentRate = this.kinkModel(utilizationInput);
    const targetUtil  = KINK_UTILIZATION;
    const delta       = utilizationInput - targetUtil;

    let recommendation: string;
    if (delta > 0n) {
      // Above kink: rates are already elevated, consider governance to raise kink
      recommendation = "Utilization above kink — consider raising kink threshold via governance";
    } else if (utilizationInput < WAD / 4n) {
      recommendation = "Low utilization — consider reducing base rate to attract borrowers";
    } else {
      recommendation = "Utilization within healthy range — no rate change recommended";
    }

    return {
      utilizationWad:   utilizationInput.toString(),
      currentRatePerSec: currentRate.toString(),
      recommendation,
      humanApprovalRequired: true,
      note: "Rate changes must be submitted as governance proposals",
    };
  }

  private async checkLiquidationRisk(payload: Record<string, unknown>): Promise<Record<string, unknown>> {
    const positions = payload["positions"] as Array<{
      account: string; collateralGST: number; debtGST: number; collateralFactor: number
    }> | undefined;

    if (!positions?.length) {
      return { error: "positions[] required for liquidation check" };
    }

    const atRisk = positions
      .map(p => {
        const maxDebt  = p.collateralGST * p.collateralFactor;
        const healthFactor = maxDebt / Math.max(p.debtGST, 1e-18);
        return { ...p, healthFactor: +healthFactor.toFixed(4), atRisk: healthFactor < CRITICAL_HEALTH_FACTOR };
      })
      .filter(p => p.atRisk);

    if (atRisk.length > 0) {
      bus.publish("alert:anomaly", "lend", {
        type:     "liquidation-risk",
        count:    atRisk.length,
        accounts: atRisk.map(p => p.account),
      });
    }

    return {
      total:     positions.length,
      atRisk:    atRisk.length,
      positions: atRisk,
      threshold: CRITICAL_HEALTH_FACTOR,
    };
  }

  /** Mirrors GhostLend.sol utilization-rate model */
  private kinkModel(utilization: bigint): bigint {
    if (utilization <= KINK_UTILIZATION) {
      return BASE_RATE_PER_SEC + (utilization * KINK_MULTIPLIER / WAD);
    }
    const excessUtil = utilization - KINK_UTILIZATION;
    return BASE_RATE_PER_SEC
      + (KINK_UTILIZATION * KINK_MULTIPLIER / WAD)
      + (excessUtil * JUMP_MULTIPLIER / WAD);
  }

  private async fetchUtilization(): Promise<bigint | null> {
    if (GHOSTLEND_CONTRACT === "0x0000000000000000000000000000000000000000") return null;
    try {
      // Call GhostLend.utilizationRate() — selector 0x6f307dc3
      const ctrl = new AbortController();
      setTimeout(() => ctrl.abort(), 4_000);
      const res = await fetch(L1_RPC, {
        method:  "POST",
        headers: { "content-type": "application/json" },
        body:    JSON.stringify({
          jsonrpc: "2.0", id: 1, method: "eth_call",
          params: [{ to: GHOSTLEND_CONTRACT, data: "0x6f307dc3" }, "latest"],
        }),
        signal: ctrl.signal,
      });
      const body = await res.json() as { result?: string };
      if (body.result) return BigInt(body.result);
    } catch { /* RPC offline */ }
    return null;
  }
}
