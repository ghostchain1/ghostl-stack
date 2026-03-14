/**
 * @file units.ts
 * @module @ghostchain/ghostchain-util/units
 *
 * GST unit conversion utilities — no ethers dependency.
 * All arithmetic uses native BigInt for exact precision.
 *
 *   1 GST = 1_000_000_000_000_000_000 ghost-wei  (18 decimals)
 *   1 mGST = 1_000_000_000_000_000      (15 decimals / milliGST)
 *   1 gwei  = 1_000_000_000             ( 9 decimals)
 *   1 kwei  = 1_000                     ( 3 decimals)
 */

import { GhostUnitError } from "./errors.js";
import type { GhostBigNumberish } from "./types.js";

// ─── Named unit table ─────────────────────────────────────────────────────────

/** Named GST sub-units and their decimal places. */
export const GhostUnitsTable = {
  /** Smallest indivisible unit (ghost-wei ≈ GhostChain wei) */
  "ghost-wei":  0,
  kwei:         3,
  mwei:         6,
  gwei:         9,
  szabo:        12,
  finney:       15,
  /** 1 GST = 10^18 ghost-wei */
  GST:          18,
  /** Alias for GST */
  ether:        18,
} as const;

export type GhostUnitName = keyof typeof GhostUnitsTable;

// ─── Internal bigint helpers ──────────────────────────────────────────────────

function _pow10(e: number): bigint {
  return BigInt(10) ** BigInt(e);
}

/**
 * Parse a decimal string (e.g. "1.5") into raw bigint units at `decimals` precision.
 */
function _parseDecimal(value: string, decimals: number): bigint {
  const trimmed = value.trim();
  const negative = trimmed.startsWith("-");
  const abs = negative ? trimmed.slice(1) : trimmed;

  const dotIdx = abs.indexOf(".");
  let intPart: string;
  let fracPart: string;

  if (dotIdx === -1) {
    intPart = abs;
    fracPart = "";
  } else {
    intPart = abs.slice(0, dotIdx) || "0";
    fracPart = abs.slice(dotIdx + 1);
  }

  if (!/^\d+$/.test(intPart) || (fracPart && !/^\d+$/.test(fracPart)))
    throw new GhostUnitError(`parseGhostUnits: invalid numeric string "${value}"`);

  if (fracPart.length > decimals)
    throw new GhostUnitError(`parseGhostUnits: "${value}" has more than ${decimals} decimal places`);

  const padded = fracPart.padEnd(decimals, "0");
  const raw = BigInt(intPart) * _pow10(decimals) + BigInt(padded || "0");
  return negative ? -raw : raw;
}

/**
 * Format a raw bigint `value` at `decimals` precision into a trimmed decimal string.
 */
function _formatDecimal(value: bigint, decimals: number): string {
  const negative = value < 0n;
  const abs = negative ? -value : value;
  const scale = _pow10(decimals);
  const intPart = (abs / scale).toString();
  const fracRaw = (abs % scale).toString().padStart(decimals, "0");
  const frac = fracRaw.replace(/0+$/, ""); // trim trailing zeros
  const result = frac ? `${intPart}.${frac}` : intPart;
  return negative ? "-" + result : result;
}

// ─── Generic precision API ───────────────────────────────────────────────────

/**
 * Parse a human-readable decimal string to raw bigint at arbitrary `decimals`.
 *
 * @example parseGhostUnits("1.5", 18)  → 1_500_000_000_000_000_000n
 * @example parseGhostUnits("0.001", 9) → 1_000_000n
 */
export function parseGhostUnits(value: string, decimals: number): bigint {
  if (decimals < 0 || !Number.isInteger(decimals))
    throw new GhostUnitError(`parseGhostUnits: decimals must be a non-negative integer, got ${decimals}`);
  return _parseDecimal(value, decimals);
}

/**
 * Format raw bigint `value` from `decimals`-precision to a human-readable string.
 *
 * @example formatGhostUnits(1_500_000_000_000_000_000n, 18) → "1.5"
 */
export function formatGhostUnits(value: GhostBigNumberish, decimals: number): string {
  if (decimals < 0 || !Number.isInteger(decimals))
    throw new GhostUnitError(`formatGhostUnits: decimals must be a non-negative integer, got ${decimals}`);
  return _formatDecimal(BigInt(value), decimals);
}

// ─── GST (18-decimal) convenience API ────────────────────────────────────────

/**
 * Parse a GST decimal string to ghost-wei (raw bigint, 18 decimals).
 * @example parseGST("1.5") → 1_500_000_000_000_000_000n
 */
export function parseGST(value: string): bigint {
  return parseGhostUnits(value, 18);
}

/**
 * Format raw ghost-wei to a GST decimal string.
 * @example formatGST(1_500_000_000_000_000_000n) → "1.5"
 */
export function formatGST(value: GhostBigNumberish): string {
  return formatGhostUnits(value, 18);
}

// ─── Named-unit API ───────────────────────────────────────────────────────────

/**
 * Parse a decimal string in the specified unit to ghost-wei.
 * @example parseUnits("1", "gwei") → 1_000_000_000n
 */
export function parseUnits(value: string, unit: GhostUnitName | number): bigint {
  const decimals = typeof unit === "number" ? unit : GhostUnitsTable[unit];
  return parseGhostUnits(value, decimals);
}

/**
 * Format ghost-wei to the specified unit as a decimal string.
 * @example formatUnits(1_000_000_000n, "gwei") → "1.0"
 */
export function formatUnits(value: GhostBigNumberish, unit: GhostUnitName | number): string {
  const decimals = typeof unit === "number" ? unit : GhostUnitsTable[unit];
  return formatGhostUnits(value, decimals);
}

// ─── Gwei shortcuts ───────────────────────────────────────────────────────────

/** Parse gwei decimal string to ghost-wei bigint. */
export function parseGwei(value: string): bigint {
  return parseGhostUnits(value, 9);
}

/** Format ghost-wei bigint to gwei decimal string. */
export function formatGwei(value: GhostBigNumberish): string {
  return formatGhostUnits(value, 9);
}

// ─── Constants ───────────────────────────────────────────────────────────────

/** 1 GST in ghost-wei as a BigInt constant. */
export const ONE_GST: bigint = _pow10(18);

/** 1 gwei in ghost-wei as a BigInt constant. */
export const ONE_GWEI: bigint = _pow10(9);

/** Maximum supply: 1 billion GST in ghost-wei. */
export const GST_MAX_SUPPLY: bigint = 1_000_000_000n * ONE_GST;
