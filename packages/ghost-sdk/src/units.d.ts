/**
 * Ghost Unit System
 *
 * GhostChain sovereign unit nomenclature (replaces legacy chain units):
 *   1 Ghost  = 1e18 GhostWei
 *   1 GhostGwei = 1e9 GhostWei
 *
 * All functions are pure wrappers around ethers v6 parse/format helpers
 * so the underlying arithmetic is battle-tested.
 */
import { type BigNumberish } from "ethers";
/** 1 GhostWei  — smallest indivisible unit of GST (10^0). */
export declare const GHOST_WEI = 1n;
/** 1 GhostGwei — 1e9 GhostWei. */
export declare const GHOST_GWEI = 1000000000n;
/** 1 Ghost     — 1e18 GhostWei (full token). */
export declare const GHOST_UNIT = 1000000000000000000n;
/**
 * Parse a human-readable Ghost amount into GhostWei (bigint).
 *
 * @example
 *   parseGhost("1.5")  // 1500000000000000000n
 */
export declare function parseGhost(ghost: string): bigint;
/**
 * Format GhostWei (bigint) into a human-readable Ghost string.
 *
 * @example
 *   formatGhost(1500000000000000000n)  // "1.5"
 */
export declare function formatGhost(ghostWei: BigNumberish): string;
/**
 * Parse a GhostGwei amount into GhostWei (bigint).
 *
 * @example
 *   parseGhostGwei("2.5")  // 2500000000n
 */
export declare function parseGhostGwei(ghostGwei: string): bigint;
/**
 * Format GhostWei (bigint) into a GhostGwei string.
 *
 * @example
 *   formatGhostGwei(2500000000n)  // "2.5"
 */
export declare function formatGhostGwei(ghostWei: BigNumberish): string;
/**
 * `GhostUnits` — Ghost-branded unit system.
 *
 * ```ts
 * import { GhostUnits } from "@ghostl/ghost-sdk";
 * const amount = GhostUnits.parseGhost("10.5");   // 10.5 GST in GhostWei
 * ```
 */
export declare const GhostUnits: {
    readonly GHOST_WEI: 1n;
    readonly GHOST_GWEI: 1000000000n;
    readonly GHOST_UNIT: 1000000000000000000n;
    readonly parseGhost: typeof parseGhost;
    readonly formatGhost: typeof formatGhost;
    readonly parseGhostGwei: typeof parseGhostGwei;
    readonly formatGhostGwei: typeof formatGhostGwei;
};
//# sourceMappingURL=units.d.ts.map