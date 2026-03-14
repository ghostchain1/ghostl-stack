"use strict";
/**
 * AI Engine: scoring, decisions, and the pluggable interface.
 *
 * Ships as a safe deterministic heuristic ("AI-lite") by default.
 * Swap in a remote GhostBrain Core implementation by supplying a custom
 * `GhostAiEngine` to `AutonomousGhostProvider`.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.HeuristicAiEngine = void 0;
// ── Scoring helper ────────────────────────────────────────────────────────────
/**
 * Composite health score — higher is better.
 * Weights: availability > error-rate > head-lag > latency > recency
 */
function score(h) {
    if (h.circuitOpen)
        return -Infinity;
    const latencyScore = 1 / Math.max(50, h.latencyMs);
    const errorPenalty = h.errorRate * 5;
    const lagPenalty = Math.min(20, h.headLag) * 0.1;
    const recencyBonus = (Date.now() - h.lastOkAt) < 30_000 ? 0.5 : 0;
    return latencyScore + recencyBonus - errorPenalty - lagPenalty;
}
// ── Default implementation ────────────────────────────────────────────────────
/**
 * Deterministic heuristic AI engine.
 *
 * Decision logic:
 * - Writes → safest (lowest error-rate + lag, ignoring raw latency)
 * - Reads with health concerns → quorum across top-2 endpoints
 * - Reads otherwise → fastest viable endpoint
 * - External → fastest (no head-lag concept applies)
 */
class HeuristicAiEngine {
    decide(intent, candidates) {
        const viable = candidates
            .filter(c => !c.circuitOpen)
            .sort((a, b) => score(b) - score(a));
        if (viable.length === 0) {
            // Last resort: pick least-bad open circuit rather than crash.
            const fallback = [...candidates].sort((a, b) => score(b) - score(a))[0];
            if (!fallback)
                throw new Error("No RPC candidates available.");
            return {
                chosenUrl: fallback.url,
                reason: "All circuits open; using least-bad fallback",
                strategy: "SAFEST",
            };
        }
        // Externals: fastest only (no head concept)
        if (intent.kind === "EXTERNAL") {
            const fast = [...viable].sort((a, b) => a.latencyMs - b.latencyMs)[0];
            return { chosenUrl: fast.url, reason: "EXTERNAL: fastest endpoint", strategy: "FASTEST" };
        }
        // Writes: prioritise safety (low error + lag)
        if (intent.kind === "WRITE") {
            const safest = viable[0]; // already sorted by composite score
            return { chosenUrl: safest.url, reason: "WRITE: safest-scored endpoint", strategy: "SAFEST" };
        }
        // Reads: escalate to quorum if any top-3 endpoint looks risky
        const top = viable.slice(0, 3);
        const risky = top.some(x => x.errorRate > 0.05 || x.headLag > 2);
        if (risky && top.length >= 2) {
            return {
                chosenUrl: top[0].url,
                quorumUrls: top.slice(0, 2).map(x => x.url),
                reason: "READ: anomaly detected; engaging quorum mode",
                strategy: "QUORUM",
            };
        }
        // Reads: fastest healthy endpoint
        const fast = [...viable].sort((a, b) => a.latencyMs - b.latencyMs)[0];
        return { chosenUrl: fast.url, reason: "READ: fastest viable endpoint", strategy: "FASTEST" };
    }
}
exports.HeuristicAiEngine = HeuristicAiEngine;
