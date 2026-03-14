/**
 * AutonomousGhostProvider — single entry point for all RPC operations.
 *
 * Responsibilities
 * ─────────────────
 *  1. GhostStack routing law: L3 → L2 → L1 only; L1 → external only
 *  2. AI-assisted endpoint selection (latency, error-rate, head-health)
 *  3. Circuit-breaker enforcement via RpcPool
 *  4. Quorum reads (median across N healthy endpoints)
 */
import type { JsonRpcProvider } from "ethers";
import type { GhostAiEngine } from "./ai-engine.js";
export interface AutonomousConfig {
    /** RPC endpoint URLs for each GhostStack layer. */
    l1: string[];
    l2: string[];
    l3: string[];
    /**
     * External RPC endpoints (e.g. GhostChain mainnet / GhostRPC).
     * Only reachable via `external()` and only when `allowExternalOnL1=true`.
     */
    externals?: string[];
    /**
     * Must be explicitly set to `true` to call `.external()`.
     * Reflects the GhostStack law: only L1 may talk to the outside world.
     */
    allowExternalOnL1?: boolean;
    /** Override the AI engine; defaults to HeuristicAiEngine. */
    aiEngine?: GhostAiEngine;
    /**
     * Health-probe interval in milliseconds.
     * Set to 0 to disable background probing (useful in tests).
     */
    probeIntervalMs?: number;
}
export declare class AutonomousGhostProvider {
    private readonly pool;
    private readonly ai;
    private readonly cfg;
    constructor(cfg: AutonomousConfig);
    /** Gracefully stop background probing. Call when shutting down the service. */
    destroy(): void;
    /**
     * Obtain a provider for the given layer.
     *
     * @param layer  Target layer ("L1" | "L2" | "L3").
     * @param mode   "READ" (fastest) or "WRITE" (safest / most reliable).
     */
    providerFor(layer: "L1" | "L2" | "L3", mode?: "READ" | "WRITE"): JsonRpcProvider;
    /**
     * Routing-aware upstream bridge.
     * L3 → L2, L2 → L1.  Direct L3 → L1 is forbidden by GhostStack law.
     */
    upstreamFrom(from: "L3" | "L2"): JsonRpcProvider;
    /**
     * Access an external (non-GhostStack) network.
     * Only permitted when `allowExternalOnL1 = true` in config.
     */
    external(name?: string): JsonRpcProvider;
    /**
     * Quorum read — asks `quorum` healthy endpoints and returns the median
     * block number.  Throws `GhostQuorumError` if fewer than `quorum`
     * endpoints respond successfully.
     *
     * @param layer  Target layer to query.
     * @param quorum Minimum number of matching (±1 block) responses required.
     */
    quorumBlockNumber(layer: "L1" | "L2" | "L3", quorum?: number): Promise<number>;
    private _enforce;
}
//# sourceMappingURL=autonomous-provider.d.ts.map