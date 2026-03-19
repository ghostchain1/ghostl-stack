/**
 * GhostBrainAiEngine — remote AI engine backed by GhostBrain Core.
 *
 * Calls POST /api/v1/rpc/decide on the GhostBrain Core service.
 * On any network / timeout error, silently falls back to the local
 * HeuristicAiEngine so callers always get a routing decision.
 *
 * Usage:
 *   import { GhostBrainAiEngine, AutonomousGhostProvider } from "@ghostl/ghost-sdk";
 *
 *   const router = new AutonomousGhostProvider({
 *     l1: ["http://localhost:18545"],
 *     l2: ["http://localhost:29547"],
 *     l3: ["http://localhost:39545"],
 *     aiEngine: new GhostBrainAiEngine({ url: "http://ghostbrain-core:4000" }),
 *   });
 */
import type { GhostAiEngine, RpcHealth, RouteIntent, AiDecision } from "./ai-engine.js";
export interface GhostBrainEngineConfig {
    /**
     * Base URL of the ghostbrain-core service, e.g. "http://ghostbrain-core:4000".
     * Defaults to GHOSTBRAIN_CORE_URL env var, then "http://localhost:4000".
     */
    url?: string;
    /**
     * HMAC secret to sign outbound requests (must match CONTROL_PLANE_HMAC_SECRET
     * in ghostbrain-core).  Defaults to CONTROL_PLANE_HMAC_SECRET env var.
     * If absent, requests are sent unsigned (dev-mode pass-through).
     */
    hmacSecret?: string;
    /**
     * Request timeout in milliseconds before falling back to local heuristic.
     * Default: 1 000 ms.
     */
    timeoutMs?: number;
    /**
     * Fallback engine used when GhostBrain Core is unreachable.
     * Default: HeuristicAiEngine.
     */
    fallback?: GhostAiEngine;
}
export declare class GhostBrainAiEngine implements GhostAiEngine {
    private readonly endpoint;
    private readonly secret;
    private readonly timeoutMs;
    private readonly fallback;
    private _failingSince;
    constructor(cfg?: GhostBrainEngineConfig);
    decide(intent: RouteIntent, candidates: RpcHealth[]): AiDecision;
    /**
     * Fully async variant — awaits the GhostBrain response, falls back locally
     * on error.  Use this when you can afford a tiny extra round-trip, e.g. in
     * event-driven contexts.
     */
    decideAsync(intent: RouteIntent, candidates: RpcHealth[]): Promise<AiDecision>;
    /** True if GhostBrain Core has been unreachable since more than `ms` ago. */
    isDegraded(ms?: number): boolean;
    private _prefetch;
}
//# sourceMappingURL=ghostbrain-engine.d.ts.map
