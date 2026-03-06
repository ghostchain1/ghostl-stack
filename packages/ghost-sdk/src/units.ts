/**
 * Ghost Unit System
 *
 * GhostChain replaces Ethereum unit nomenclature:
 *   1 Ghost  = 1e18 GhostWei
 *   1 GhostGwei = 1e9 GhostWei
 *
 * All arithmetic is implemented with native BigInt — no ethers dependency.
 */

// ── Compatibility type alias ─────────────────────────────────────────────────

/** Union of values that can represent a GhostWei amount. */
export type GhostBigNumberish = bigint | number | string;

// ── Internal helpers ─────────────────────────────────────────────────────────

/**
 * Low-level: parse a decimal string into a BigInt scaled by `decimals` places.
 * Handles optional fractional part, truncates to `decimals` significant digits.
 * @internal
 */
function _parseUnitsNative(value: string, decimals: number): bigint {
  const trimmed = value.trim();
  const negative = trimmed.startsWith("-");
  const abs = negative ? trimmed.slice(1) : trimmed;

  if (!/^\d+(?:\.\d+)?$/.test(abs)) {
    throw new TypeError(`GhostUnits: invalid numeric string "${value}"`);
  }

  const [intStr, fracStr = ""] = abs.split(".");
  const frac = fracStr.padEnd(decimals, "0").slice(0, decimals);
  const raw  = BigInt(intStr || "0") * 10n ** BigInt(decimals) + BigInt(frac || "0");
  return negative ? -raw : raw;
}

/**
 * Low-level: format a BigInt scaled by `decimals` back to a decimal string.
 * @internal
 */
function _formatUnitsNative(value: GhostBigNumberish, decimals: number): string {
  const wei  = BigInt(value);
  const neg  = wei < 0n;
  const abs  = neg ? -wei : wei;
  const unit = 10n ** BigInt(decimals);
  const int  = abs / unit;
  const frac = (abs % unit).toString().padStart(decimals, "0").replace(/0+$/, "");
  const base = frac ? `${int}.${frac}` : `${int}`;
  return neg ? `-${base}` : base;
}

// ── Unit constants ───────────────────────────────────────────────────────────

/** 1 GhostWei  — smallest indivisible unit of GST (10^0). */
export const GHOST_WEI = 1n;
/** 1 GhostGwei — 1e9 GhostWei. */
export const GHOST_GWEI = 1_000_000_000n;
/** 1 Ghost     — 1e18 GhostWei (full token). */
export const GHOST_UNIT = 1_000_000_000_000_000_000n;

// ── Conversion helpers ───────────────────────────────────────────────────────

/**
 * Parse a human-readable Ghost amount into GhostWei (bigint).
 *
 * @example
 *   parseGhost("1.5")  // 1500000000000000000n
 */
export function parseGhost(ghost: string): bigint {
  return _parseUnitsNative(ghost, 18);
}

/**
 * Format GhostWei (bigint) into a human-readable Ghost string.
 *
 * @example
 *   formatGhost(1500000000000000000n)  // "1.5"
 */
export function formatGhost(ghostWei: GhostBigNumberish): string {
  return _formatUnitsNative(ghostWei, 18);
}

/**
 * Parse a GhostGwei amount into GhostWei (bigint).
 *
 * @example
 *   parseGhostGwei("2.5")  // 2500000000n
 */
export function parseGhostGwei(ghostGwei: string): bigint {
  return _parseUnitsNative(ghostGwei, 9);
}

/**
 * Format GhostWei (bigint) into a GhostGwei string.
 *
 * @example
 *   formatGhostGwei(2500000000n)  // "2.5"
 */
export function formatGhostGwei(ghostWei: GhostBigNumberish): string {
  return _formatUnitsNative(ghostWei, 9);
}

/**
 * Generic: parse any decimal string with arbitrary `decimals` precision.
 *
 * @example
 *   parseGhostUnits("1.5", 6)  // 1500000n
 */
export function parseGhostUnits(value: string, decimals: number): bigint {
  return _parseUnitsNative(value, decimals);
}

/**
 * Generic: format any BigInt with arbitrary `decimals` precision.
 *
 * @example
 *   formatGhostUnits(1500000n, 6)  // "1.5"
 */
export function formatGhostUnits(value: GhostBigNumberish, decimals: number): string {
  return _formatUnitsNative(value, decimals);
}

// ── Namespaced unit object ───────────────────────────────────────────────────

/**
 * `GhostUnits` — Ghost-branded unit system.
 *
 * ```ts
 * import { GhostUnits } from "@ghostl/ghost-sdk";
 * const amount = GhostUnits.parseGhost("10.5");   // 10.5 GST in GhostWei
 * ```
 */
export const GhostUnits = {
  GHOST_WEI,
  GHOST_GWEI,
  GHOST_UNIT,
  parseGhost,
  formatGhost,
  parseGhostGwei,
  formatGhostGwei,
  parseGhostUnits,
  formatGhostUnits,
} as const;
