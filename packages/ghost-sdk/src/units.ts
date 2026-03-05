/**
 * Ghost Unit System
 *
 * GhostChain replaces Ethereum unit nomenclature:
 *   1 Ghost  = 1e18 GhostWei
 *   1 GhostGwei = 1e9 GhostWei
 *
 * All functions are pure wrappers around ethers v6 parse/format helpers
 * so the underlying arithmetic is battle-tested.
 */

import {
  parseEther,
  formatEther,
  parseUnits,
  formatUnits,
  type BigNumberish,
} from "ethers";

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
  return parseEther(ghost);
}

/**
 * Format GhostWei (bigint) into a human-readable Ghost string.
 *
 * @example
 *   formatGhost(1500000000000000000n)  // "1.5"
 */
export function formatGhost(ghostWei: BigNumberish): string {
  return formatEther(ghostWei);
}

/**
 * Parse a GhostGwei amount into GhostWei (bigint).
 *
 * @example
 *   parseGhostGwei("2.5")  // 2500000000n
 */
export function parseGhostGwei(ghostGwei: string): bigint {
  return parseUnits(ghostGwei, 9);
}

/**
 * Format GhostWei (bigint) into a GhostGwei string.
 *
 * @example
 *   formatGhostGwei(2500000000n)  // "2.5"
 */
export function formatGhostGwei(ghostWei: BigNumberish): string {
  return formatUnits(ghostWei, 9);
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
} as const;
