/**
 * treasury-engine.ts — Treasury buyback design module.
 *
 * Generates a TreasuryBuyback contract, computes expected buyback pressure
 * over time, and integrates with the GhostXRouter for revenue → target-token swaps.
 */

import {
  generateContract,
  type GeneratedFile,
  type TreasuryBuybackOptions,
} from "@ghostchain/ghost-contract-factory";
import { getAmountOut } from "../math/amm-math.js";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface TreasuryConfig {
  projectName: string;
  /** Monthly protocol revenue in revenue token units (18 dec bigint) */
  monthlyRevenue: bigint;
  /**
   * Expected pool reserves (reserve0 = revenue token, reserve1 = target token)
   * Used to simulate buyback pressure on the pool.
   */
  poolReserveRevenue: bigint;
  poolReserveTarget:  bigint;
  /** Pool fee in bps (default 30) */
  poolFeeBps?: number;
  /** Default buyback threshold (wei) before an auto-buyback event fires */
  buybackThreshold?: string;
  emitDeploy?: boolean;
  emitSdk?: boolean;
}

export interface TreasuryDesignOutput {
  files: GeneratedFile[];
  simulation: TreasurySimulation;
}

export interface TreasurySimulation {
  /** Monthly revenue (wei) */
  monthlyRevenueBn:    string;
  /** Monthly buyback threshold triggers expected */
  expectedTriggers:    number;
  /** Target tokens bought per trigger at current pool reserves */
  targetBoughtPerTrigger: string;
  /** Total monthly target token acquisition (wei) */
  totalMonthlyBuyback: string;
  /** Buyback price impact on pool (%) */
  buybackPriceImpact:  string;
}

// ── Engine ────────────────────────────────────────────────────────────────────

export function designTreasury(config: TreasuryConfig): TreasuryDesignOutput {
  const feeBps = config.poolFeeBps ?? 30;
  const thresholdBn = BigInt(
    config.buybackThreshold ?? (config.monthlyRevenue / 4n).toString(), // default: quarterly trigger
  );

  const result = generateContract({
    type: "treasury-buyback",
    name: config.projectName,
    options: {
      name:             `${config.projectName}TreasuryBuyback`,
      label:            config.projectName,
      defaultThreshold: thresholdBn.toString(),
    } satisfies Partial<TreasuryBuybackOptions>,
    emitDeployScript: config.emitDeploy ?? true,
    emitSdkWrapper:   config.emitSdk   ?? false,
  });

  const files: GeneratedFile[] = Array.isArray(result.solidity)
    ? result.solidity
    : [result.solidity];
  if (result.deployScript) files.push(result.deployScript);
  if (result.sdkWrapper)   files.push(result.sdkWrapper);

  // ── Simulation ─────────────────────────────────────────────────────────────
  const triggers = thresholdBn > 0n
    ? Number(config.monthlyRevenue / thresholdBn)
    : 1;

  const revenuePerTrigger = triggers > 0
    ? config.monthlyRevenue / BigInt(triggers)
    : config.monthlyRevenue;

  const targetOut = getAmountOut(
    revenuePerTrigger,
    config.poolReserveRevenue,
    config.poolReserveTarget,
    feeBps,
  );

  const totalBuyback = targetOut * BigInt(triggers);

  // Price impact for a single trigger buyback
  const impactPct = Number(revenuePerTrigger) / Number(config.poolReserveRevenue) * 100;

  const simulation: TreasurySimulation = {
    monthlyRevenueBn:       config.monthlyRevenue.toString(),
    expectedTriggers:       triggers,
    targetBoughtPerTrigger: targetOut.toString(),
    totalMonthlyBuyback:    totalBuyback.toString(),
    buybackPriceImpact:     `${impactPct.toFixed(4)}%`,
  };

  return { files, simulation };
}
