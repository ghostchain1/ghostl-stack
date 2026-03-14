/**
 * amm-engine.ts — Automated Market Maker design module.
 *
 * Designs an AMM contract suite (Pair + Factory + Router) via ghost-contract-factory,
 * and simulates pool behavior using amm-math.
 */

import {
  generateContract,
  type GeneratedFile,
  type DexOptions,
} from "@ghostchain/ghost-contract-factory";
import {
  getAmountOut,
  getAmountIn,
  priceImpactPct,
  spotPrice,
  optimalLiquidityAmounts,
  liquidityMinted,
  simulateMultiHop,
  type PoolState,
} from "../math/amm-math.js";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface AmmConfig {
  /** Project name, used as prefix for contract names */
  projectName: string;
  /** Default swap fee in basis points (default: 30 = 0.3%) */
  feeBps?: number;
  /** Whether to emit a deploy script */
  emitDeploy?: boolean;
  /** Whether to emit a TypeScript SDK wrapper */
  emitSdk?: boolean;
}

export interface AmmDesignOutput {
  files: GeneratedFile[];
  simulation: AmmSimulation;
}

export interface AmmSimulation {
  feeBps: number;
  /** Simulated swap: 1 token0 → token1 at 50/50 pool with 100k liquidity each */
  sampleSwapOutput: string;
  /** Price impact % for the sample swap */
  samplePriceImpact: string;
  /** Simulated multi-hop: token0 → token1 → token2 at sample reserves */
  sampleMultiHop: string;
}

// ── Engine ────────────────────────────────────────────────────────────────────

export function designAmm(config: AmmConfig): AmmDesignOutput {
  const feeBps = config.feeBps ?? 30;

  const result = generateContract({
    type: "dex",
    name: config.projectName,
    options: {
      label: config.projectName,
    } satisfies Partial<DexOptions>,
    emitDeployScript: config.emitDeploy ?? true,
    emitSdkWrapper:   config.emitSdk   ?? false,
  });

  const files: GeneratedFile[] = Array.isArray(result.solidity)
    ? result.solidity
    : [result.solidity];

  if (result.deployScript) files.push(result.deployScript);
  if (result.sdkWrapper)   files.push(result.sdkWrapper);

  // ── Simulation ─────────────────────────────────────────────────────────────
  const SAMPLE_RESERVE = 100_000n * 10n ** 18n;
  const SAMPLE_AMOUNT  = 1_000n  * 10n ** 18n;

  const amountOut = getAmountOut(SAMPLE_AMOUNT, SAMPLE_RESERVE, SAMPLE_RESERVE, feeBps);
  const impact    = priceImpactPct(SAMPLE_AMOUNT, SAMPLE_RESERVE);

  const pool0: PoolState = { reserve0: SAMPLE_RESERVE, reserve1: SAMPLE_RESERVE * 2n, feeBps };
  const pool1: PoolState = { reserve0: SAMPLE_RESERVE * 2n, reserve1: SAMPLE_RESERVE, feeBps };
  const { amountOut: multiHopOut } = simulateMultiHop(SAMPLE_AMOUNT, [pool0, pool1]);

  const simulation: AmmSimulation = {
    feeBps,
    sampleSwapOutput:  `${formatToken(amountOut)} token1 for 1000 token0`,
    samplePriceImpact: `${impact.toFixed(4)}%`,
    sampleMultiHop:    `${formatToken(multiHopOut)} token2 for 1000 token0 (2-hop)`,
  };

  return { files, simulation };
}

// ── Simulation helpers (exported for direct use in routes) ────────────────────

export function simulateSwap(
  amountIn: bigint,
  pool: PoolState,
  feeBps: number,
): { amountOut: bigint; priceImpact: number } {
  const amountOut  = getAmountOut(amountIn, pool.reserve0, pool.reserve1, feeBps);
  const priceImpact = priceImpactPct(amountIn, pool.reserve0);
  return { amountOut, priceImpact };
}

export function quoteSwapExact(
  amountOut: bigint,
  pool: PoolState,
  feeBps: number,
): { amountIn: bigint } {
  return { amountIn: getAmountIn(amountOut, pool.reserve0, pool.reserve1, feeBps) };
}

export function quoteSpotPrice(pool: PoolState): number {
  return spotPrice(pool.reserve0, pool.reserve1, 18, 18);
}

export function quoteOptimalLiquidity(
  amount0Desired: bigint,
  amount1Desired: bigint,
  pool: PoolState,
  lpTotalSupply: bigint,
): { amount0: bigint; amount1: bigint; liquidity: bigint } {
  const { amount0, amount1 } = optimalLiquidityAmounts(
    amount0Desired, amount1Desired, pool.reserve0, pool.reserve1,
  );
  const lp = liquidityMinted(amount0, amount1, pool.reserve0, pool.reserve1, lpTotalSupply);
  return { amount0, amount1, liquidity: lp };
}

// ── Formatting ────────────────────────────────────────────────────────────────

function formatToken(amount: bigint): string {
  const whole = amount / 10n ** 18n;
  const frac  = (amount % 10n ** 18n).toString().padStart(18, "0").slice(0, 4);
  return `${whole}.${frac}`;
}
