/**
 * amm-math.ts — Constant-product AMM mathematics.
 *
 * Pure TypeScript — no side effects, no filesystem access.
 * All amounts are represented as BigInt (token units with decimals preserved).
 * Use `toTokenUnits(n, decimals)` / `fromTokenUnits(n, decimals)` helpers for
 * human-readable ↔ raw-unit conversions.
 *
 * Reference: GhostXPair uses 0.3% fee (997/1000) — all helpers default to that.
 */

// ── Helpers ───────────────────────────────────────────────────────────────────

export function toTokenUnits(amount: number, decimals: number): bigint {
  return BigInt(Math.round(amount * 10 ** decimals));
}

export function fromTokenUnits(amount: bigint, decimals: number): number {
  return Number(amount) / 10 ** decimals;
}

/** Integer square root (Babylonian method, same as Solidity _sqrt). */
export function sqrt(n: bigint): bigint {
  if (n < 0n) throw new RangeError("sqrt: negative input");
  if (n === 0n) return 0n;
  let x = n;
  let y = (x + 1n) / 2n;
  while (y < x) {
    x = y;
    y = (x + n / x) / 2n;
  }
  return x;
}

// ── Core AMM formulas ─────────────────────────────────────────────────────────

/**
 * Constant-product swap: amountOut for given amountIn.
 *
 * @param amountIn   Gross input amount (before fee deduction)
 * @param reserveIn  Pool reserve of the input token
 * @param reserveOut Pool reserve of the output token
 * @param feeBps     Fee in basis points (default 30 = 0.30%)
 */
export function getAmountOut(
  amountIn: bigint,
  reserveIn: bigint,
  reserveOut: bigint,
  feeBps = 30,
): bigint {
  if (amountIn === 0n) throw new RangeError("getAmountOut: zero input");
  if (reserveIn === 0n || reserveOut === 0n) throw new RangeError("getAmountOut: empty reserves");

  const feeFactor = 10_000n - BigInt(feeBps);
  const amountInWithFee = amountIn * feeFactor;
  const numerator       = amountInWithFee * reserveOut;
  const denominator     = reserveIn * 10_000n + amountInWithFee;
  return numerator / denominator;
}

/**
 * Constant-product swap: amountIn required to receive exactly amountOut.
 *
 * @param amountOut  Desired output amount
 * @param reserveIn  Pool reserve of the input token
 * @param reserveOut Pool reserve of the output token
 * @param feeBps     Fee in basis points (default 30 = 0.30%)
 */
export function getAmountIn(
  amountOut: bigint,
  reserveIn: bigint,
  reserveOut: bigint,
  feeBps = 30,
): bigint {
  if (amountOut === 0n) throw new RangeError("getAmountIn: zero output");
  if (reserveIn === 0n || reserveOut === 0n) throw new RangeError("getAmountIn: empty reserves");
  if (amountOut >= reserveOut) throw new RangeError("getAmountIn: amountOut >= reserveOut");

  const feeFactor = 10_000n - BigInt(feeBps);
  const numerator   = reserveIn * amountOut * 10_000n;
  const denominator = (reserveOut - amountOut) * feeFactor;
  return numerator / denominator + 1n; // round up (ceiling division)
}

/**
 * Price impact of a swap as a percentage (0–100).
 * Positive means your swap moves the price against you.
 */
export function priceImpactPct(amountIn: bigint, reserveIn: bigint): number {
  if (reserveIn === 0n) return 100;
  // impact = amountIn / (reserveIn + amountIn) * 100
  const impact = (amountIn * 10_000n) / (reserveIn + amountIn);
  return Number(impact) / 100;
}

/**
 * Marginal spot price: how many token1 per token0 (no fee).
 * Returns a float for readability.
 */
export function spotPrice(reserve0: bigint, reserve1: bigint, decimals0 = 18, decimals1 = 18): number {
  if (reserve0 === 0n) return 0;
  // Adjust for decimal difference
  const adj = 10 ** (decimals0 - decimals1);
  return (Number(reserve1) / Number(reserve0)) * adj;
}

// ── Liquidity ─────────────────────────────────────────────────────────────────

/**
 * Optimal amounts to add given desired amounts and current reserves.
 * Returns { amount0, amount1 } — one will equal the desired, the other capped.
 *
 * When pool is empty (both reserves zero), returns the desired amounts unchanged.
 */
export function optimalLiquidityAmounts(
  amount0Desired: bigint,
  amount1Desired: bigint,
  reserve0: bigint,
  reserve1: bigint,
): { amount0: bigint; amount1: bigint } {
  if (reserve0 === 0n && reserve1 === 0n) {
    return { amount0: amount0Desired, amount1: amount1Desired };
  }

  const amount1Optimal = (amount0Desired * reserve1) / reserve0;
  if (amount1Optimal <= amount1Desired) {
    return { amount0: amount0Desired, amount1: amount1Optimal };
  }

  const amount0Optimal = (amount1Desired * reserve0) / reserve1;
  return { amount0: amount0Optimal, amount1: amount1Desired };
}

/**
 * LP shares minted for a liquidity deposit.
 *
 * @param amount0       Amount of token0 deposited
 * @param amount1       Amount of token1 deposited
 * @param reserve0      Current reserve0
 * @param reserve1      Current reserve1
 * @param totalSupply   Current LP total supply
 * @param minLiquidity  Locked liquidity on first deposit (default 1_000)
 */
export function liquidityMinted(
  amount0: bigint,
  amount1: bigint,
  reserve0: bigint,
  reserve1: bigint,
  totalSupply: bigint,
  minLiquidity = 1_000n,
): bigint {
  if (totalSupply === 0n) {
    const liq = sqrt(amount0 * amount1);
    if (liq <= minLiquidity) throw new RangeError("liquidityMinted: insufficient initial liquidity");
    return liq - minLiquidity;
  }
  const liq0 = (amount0 * totalSupply) / reserve0;
  const liq1 = (amount1 * totalSupply) / reserve1;
  return liq0 < liq1 ? liq0 : liq1;
}

/**
 * Underlying token amounts redeemable for `shares` LP tokens.
 */
export function liquidityRedeemable(
  shares: bigint,
  totalSupply: bigint,
  reserve0: bigint,
  reserve1: bigint,
): { amount0: bigint; amount1: bigint } {
  return {
    amount0: (shares * reserve0) / totalSupply,
    amount1: (shares * reserve1) / totalSupply,
  };
}

// ── Multi-hop path simulation ─────────────────────────────────────────────────

export interface PoolState {
  reserve0: bigint;
  reserve1: bigint;
  feeBps?: number;
}

/**
 * Simulate a multi-hop swap through an ordered list of pools.
 * Each hop's output becomes the next hop's input.
 *
 * @returns Final output amount after all hops, and per-hop breakdown.
 */
export function simulateMultiHop(
  amountIn: bigint,
  pools: PoolState[],
): { amountOut: bigint; hops: { in: bigint; out: bigint }[] } {
  let current = amountIn;
  const hops: { in: bigint; out: bigint }[] = [];

  for (const pool of pools) {
    const hopOut = getAmountOut(current, pool.reserve0, pool.reserve1, pool.feeBps ?? 30);
    hops.push({ in: current, out: hopOut });
    current = hopOut;
  }

  return { amountOut: current, hops };
}
