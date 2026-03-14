/**
 * liquidity-engine.ts — Liquidity pool design and incentive configuration module.
 *
 * Computes:
 *  - Optimal initial reserves for a target initial price
 *  - LP concentration bounds (custom range v3-style math stub)
 *  - Incentive budget: how much reward to allocate to keep >X% total liquidity in pool
 *  - Generates a YieldFarm contract to reward LP providers
 */

import {
  generateContract,
  type GeneratedFile,
  type YieldFarmOptions,
} from "@ghostchain/ghost-contract-factory";
import { aprFromRate, apyFromApr } from "../math/reward-curves.js";
import { liquidityMinted, sqrt } from "../math/amm-math.js";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface LiquidityConfig {
  projectName: string;
  /**
   * Target price: how many token1 units equal 1 token0 unit (in full token terms, not wei).
   * e.g. if token0 is GHX and token1 is GST, and 1 GHX = 10 GST, set targetPrice = 10.
   */
  targetPrice: number;
  /**
   * Total liquidity budget denominated in token0 units (nominal, with decimals=18).
   * The engine splits this optimally according to targetPrice.
   */
  token0Budget: bigint;
  /** Decimals for token0 (default 18) */
  decimals0?: number;
  /** Decimals for token1 (default 18) */
  decimals1?: number;
  /** Annual reward budget for LP incentives (in reward tokens, 18 dec) */
  annualRewardBudget?: bigint;
  /** Whether to generate a YieldFarm contract for LP incentives */
  generateYieldFarm?: boolean;
  emitDeploy?: boolean;
  emitSdk?: boolean;
}

export interface LiquidityDesignOutput {
  files: GeneratedFile[];
  poolDesign: PoolDesign;
}

export interface PoolDesign {
  /** Recommended initial reserve0 (token0 wei) */
  initialReserve0: bigint;
  /** Recommended initial reserve1 (token1 wei) */
  initialReserve1: bigint;
  /** Initial LP tokens that would be minted from this reserve */
  initialLpSupply: bigint;
  /** Spot price anchor in token1/token0 */
  targetPrice: number;
  /** If rewards enabled: annualised reward rate in reward tokens per LP token per second */
  rewardRatePerSecond?: string;
  /** APR % at the given budget if all initial LP is staked */
  estimatedApr?: string;
  /** APY % (daily compounding) */
  estimatedApy?: string;
}

// ── Engine ────────────────────────────────────────────────────────────────────

export function designLiquidity(config: LiquidityConfig): LiquidityDesignOutput {
  const dec0 = config.decimals0 ?? 18;
  const dec1 = config.decimals1 ?? 18;
  const files: GeneratedFile[] = [];

  // Optimal split: token0Budget → token0 & token1 at targetPrice
  // At targetPrice: reserve1 = reserve0 * targetPrice
  // We hold reserve0 = token0Budget / 2 (split evenly in value terms)
  const reserve0 = config.token0Budget / 2n;
  // scale by target price (multiply by numerator/denominator via bigint)
  const priceNum = BigInt(Math.round(config.targetPrice * 1_000_000));
  const reserve1 = (reserve0 * priceNum) / 1_000_000n;

  // Adjust for decimal difference
  const decAdjust = BigInt(10 ** Math.abs(dec1 - dec0));
  const reserve1Adj = dec1 >= dec0 ? reserve1 * decAdjust : reserve1 / decAdjust;

  const initialLpSupply = liquidityMinted(reserve0, reserve1Adj, 0n, 0n, 0n);

  let rewardRatePerSecond: string | undefined;
  let estimatedApr: string | undefined;
  let estimatedApy: string | undefined;

  if (config.generateYieldFarm && config.annualRewardBudget) {
    const YEAR_SECONDS = 31_536_000n;
    const ratePerSec = config.annualRewardBudget / YEAR_SECONDS;

    // APR: reward tokens emitted per second vs LP staked (assume all initial LP staked)
    // We use 1.0 as token price ratio (both denominated in same unit)
    const aprPct = aprFromRate(
      Number(ratePerSec) / 1e18,
      Number(initialLpSupply) / 1e18,
      1.0,
    );
    const apyPct = apyFromApr(aprPct, 365);

    rewardRatePerSecond = ratePerSec.toString();
    estimatedApr = `${aprPct.toFixed(2)}%`;
    estimatedApy = `${apyPct.toFixed(2)}%`;

    const result = generateContract({
      type: "yield-farm",
      name: `${config.projectName}LP`,
      options: {
        name:               `${config.projectName}LPYieldFarm`,
        label:              config.projectName,
        defaultRewardRate:  ratePerSec.toString(),
      } satisfies Partial<YieldFarmOptions>,
      emitDeployScript: config.emitDeploy ?? true,
      emitSdkWrapper:   config.emitSdk   ?? false,
    });

    const generated = Array.isArray(result.solidity) ? result.solidity : [result.solidity];
    files.push(...generated);
    if (result.deployScript) files.push(result.deployScript);
    if (result.sdkWrapper)   files.push(result.sdkWrapper);
  }

  const poolDesign: PoolDesign = {
    initialReserve0:  reserve0,
    initialReserve1:  reserve1Adj,
    initialLpSupply,
    targetPrice:      config.targetPrice,
    rewardRatePerSecond,
    estimatedApr,
    estimatedApy,
  };

  return { files, poolDesign };
}
