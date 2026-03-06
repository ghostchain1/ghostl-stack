"use strict";
/**
 * Ghost Unit System
 *
 * GhostChain replaces GhostChain unit nomenclature:
 *   1 Ghost  = 1e18 GhostWei
 *   1 GhostGwei = 1e9 GhostWei
 *
 * All functions are pure wrappers around ethers v6 parse/format helpers
 * so the underlying arithmetic is battle-tested.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.GhostUnits = exports.GHOST_UNIT = exports.GHOST_GWEI = exports.GHOST_WEI = void 0;
exports.parseGhost = parseGhost;
exports.formatGhost = formatGhost;
exports.parseGhostGwei = parseGhostGwei;
exports.formatGhostGwei = formatGhostGwei;
const ethers_1 = require("ethers");
// ── Unit constants ───────────────────────────────────────────────────────────
/** 1 GhostWei  — smallest indivisible unit of GST (10^0). */
exports.GHOST_WEI = 1n;
/** 1 GhostGwei — 1e9 GhostWei. */
exports.GHOST_GWEI = 1000000000n;
/** 1 Ghost     — 1e18 GhostWei (full token). */
exports.GHOST_UNIT = 1000000000000000000n;
// ── Conversion helpers ───────────────────────────────────────────────────────
/**
 * Parse a human-readable Ghost amount into GhostWei (bigint).
 *
 * @example
 *   parseGhost("1.5")  // 1500000000000000000n
 */
function parseGhost(ghost) {
    return (0, ethers_1.parseEther)(ghost);
}
/**
 * Format GhostWei (bigint) into a human-readable Ghost string.
 *
 * @example
 *   formatGhost(1500000000000000000n)  // "1.5"
 */
function formatGhost(ghostWei) {
    return (0, ethers_1.formatEther)(ghostWei);
}
/**
 * Parse a GhostGwei amount into GhostWei (bigint).
 *
 * @example
 *   parseGhostGwei("2.5")  // 2500000000n
 */
function parseGhostGwei(ghostGwei) {
    return (0, ethers_1.parseUnits)(ghostGwei, 9);
}
/**
 * Format GhostWei (bigint) into a GhostGwei string.
 *
 * @example
 *   formatGhostGwei(2500000000n)  // "2.5"
 */
function formatGhostGwei(ghostWei) {
    return (0, ethers_1.formatUnits)(ghostWei, 9);
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
exports.GhostUnits = {
    GHOST_WEI: exports.GHOST_WEI,
    GHOST_GWEI: exports.GHOST_GWEI,
    GHOST_UNIT: exports.GHOST_UNIT,
    parseGhost,
    formatGhost,
    parseGhostGwei,
    formatGhostGwei,
};
