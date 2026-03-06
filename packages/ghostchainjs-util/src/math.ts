/**
 * @file math.ts
 * @module @ghostchain/ghostchain-util/math
 *
 * BigInt math helpers for GhostChain computations.
 * All functions operate on bigint to avoid floating-point precision loss.
 */

import { GhostUtilError } from "./errors.js";

// ─── Basic helpers ────────────────────────────────────────────────────────────

/** Absolute value of a bigint. */
export function absBigInt(n: bigint): bigint {
  return n < 0n ? -n : n;
}

/** Return the larger of two bigints. */
export function maxBigInt(a: bigint, b: bigint): bigint {
  return a >= b ? a : b;
}

/** Return the smaller of two bigints. */
export function minBigInt(a: bigint, b: bigint): bigint {
  return a <= b ? a : b;
}

/**
 * Clamp `value` to the range [lo, hi].
 * Throws if lo > hi.
 */
export function clampBigInt(value: bigint, lo: bigint, hi: bigint): bigint {
  if (lo > hi) throw new GhostUtilError("MATH_ERROR", `clampBigInt: lo (${lo}) > hi (${hi})`);
  return value < lo ? lo : value > hi ? hi : value;
}

// ─── Division helpers ─────────────────────────────────────────────────────────

/**
 * Integer division rounding UP (ceiling division).
 * @example divCeil(10n, 3n) → 4n
 */
export function divCeil(a: bigint, b: bigint): bigint {
  if (b === 0n) throw new GhostUtilError("MATH_ERROR", "divCeil: division by zero");
  return (a + b - 1n) / b;
}

/**
 * Multiply then divide, avoiding intermediate overflow by using bigint.
 * Returns floor(a * b / c).
 * @example mulDiv(100n, 3n, 4n) → 75n
 */
export function mulDiv(a: bigint, b: bigint, c: bigint): bigint {
  if (c === 0n) throw new GhostUtilError("MATH_ERROR", "mulDiv: division by zero");
  return (a * b) / c;
}

/**
 * Multiply then divide rounding up.
 * Returns ceil(a * b / c).
 */
export function mulDivCeil(a: bigint, b: bigint, c: bigint): bigint {
  if (c === 0n) throw new GhostUtilError("MATH_ERROR", "mulDivCeil: division by zero");
  return (a * b + c - 1n) / c;
}

// ─── Percentage helpers ───────────────────────────────────────────────────────

/**
 * Compute `basisPoints` of `amount` where 10000 bps = 100%.
 * @example bps(1000n * 10n**18n, 500n) → 50n * 10n**18n  (5%)
 */
export function bps(amount: bigint, basisPoints: bigint): bigint {
  return mulDiv(amount, basisPoints, 10_000n);
}

/**
 * Compute `percent` percent of `amount` (integer percent, 0–100).
 */
export function percent(amount: bigint, pct: bigint): bigint {
  return mulDiv(amount, pct, 100n);
}

// ─── Power helpers ────────────────────────────────────────────────────────────

/**
 * Integer square root of a bigint (Newton's method), rounds down.
 */
export function sqrtBigInt(n: bigint): bigint {
  if (n < 0n) throw new GhostUtilError("MATH_ERROR", `sqrtBigInt: negative input ${n}`);
  if (n === 0n) return 0n;
  let x = n;
  let y = (x + 1n) >> 1n;
  while (y < x) {
    x = y;
    y = (x + n / x) >> 1n;
  }
  return x;
}

// ─── Formatting helpers ───────────────────────────────────────────────────────

/**
 * Format a bigint as a human-readable string with thousands separators.
 * @example commaFormat(1_000_000n) → "1,000,000"
 */
export function commaFormat(n: bigint): string {
  const s = absBigInt(n).toString();
  const chars: string[] = [];
  for (let i = 0; i < s.length; i++) {
    if (i > 0 && (s.length - i) % 3 === 0) chars.push(",");
    chars.push(s[i]);
  }
  return (n < 0n ? "-" : "") + chars.join("");
}
