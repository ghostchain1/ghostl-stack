/**
 * AI Engine: scoring, decisions, and the pluggable interface.
 *
 * Ships as a safe deterministic heuristic ("AI-lite") by default.
 * Swap in a remote GhostBrain Core implementation by supplying a custom
 * `GhostAiEngine` to `AutonomousGhostProvider`.
 */
export type RpcHealth = {
    url: string;
    layer: "L1" | "L2" | "L3" | "EXTERNAL";
    latencyMs: number;
    errorRate: number;
    headLag: number;
    lastOkAt: number;
    circuitOpen: boolean;
};
export type RouteIntent = {
    kind: "READ";
    layer: "L1" | "L2" | "L3";
} | {
    kind: "WRITE";
    layer: "L1" | "L2" | "L3";
} | {
    kind: "UPSTREAM";
    from: "L3" | "L2";
} | {
    kind: "EXTERNAL";
    from: "L1";
    name?: string;
};
export type AiDecision = {
    chosenUrl: string;
    reason: string;
    strategy: "FASTEST" | "SAFEST" | "QUORUM";
    quorumUrls?: string[];
};
export interface GhostAiEngine {
    /**
     * Given a routing intent and the current health snapshot for the relevant
     * RPC pool, return a routing decision.
     */
    decide(intent: RouteIntent, candidates: RpcHealth[]): AiDecision;
}
/**
 * Deterministic heuristic AI engine.
 *
 * Decision logic:
 * - Writes → safest (lowest error-rate + lag, ignoring raw latency)
 * - Reads with health concerns → quorum across top-2 endpoints
 * - Reads otherwise → fastest viable endpoint
 * - External → fastest (no head-lag concept applies)
 */
export declare class HeuristicAiEngine implements GhostAiEngine {
    decide(intent: RouteIntent, candidates: RpcHealth[]): AiDecision;
}
//# sourceMappingURL=ai-engine.d.ts.map