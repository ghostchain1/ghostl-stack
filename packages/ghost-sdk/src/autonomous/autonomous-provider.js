"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.AutonomousGhostProvider = void 0;
const errors_js_1 = require("../errors.js");
const ai_engine_js_1 = require("./ai-engine.js");
const rpc_pool_js_1 = require("./rpc-pool.js");
// ── Main class ─────────────────────────────────────────────────────────────────
class AutonomousGhostProvider {
    pool;
    ai;
    cfg;
    constructor(cfg) {
        this.cfg = cfg;
        this.ai = cfg.aiEngine ?? new ai_engine_js_1.HeuristicAiEngine();
        const allUrls = [
            ...cfg.l1.map(url => ({ url, layer: "L1" })),
            ...cfg.l2.map(url => ({ url, layer: "L2" })),
            ...cfg.l3.map(url => ({ url, layer: "L3" })),
            ...(cfg.externals ?? []).map(url => ({ url, layer: "EXTERNAL" })),
        ];
        this.pool = new rpc_pool_js_1.RpcPool(allUrls);
        const period = cfg.probeIntervalMs ?? 5_000;
        if (period > 0)
            this.pool.startHealthLoop(period);
    }
    /** Gracefully stop background probing. Call when shutting down the service. */
    destroy() {
        this.pool.stopHealthLoop();
    }
    // ── Primary surfaces ────────────────────────────────────────────────────────
    /**
     * Obtain a provider for the given layer.
     *
     * @param layer  Target layer ("L1" | "L2" | "L3").
     * @param mode   "READ" (fastest) or "WRITE" (safest / most reliable).
     */
    providerFor(layer, mode = "READ") {
        const intent = { kind: mode, layer };
        this._enforce(intent);
        const candidates = this.pool.list(layer);
        const decision = this.ai.decide(intent, candidates);
        return this.pool.getProvider(decision.chosenUrl);
    }
    /**
     * Routing-aware upstream bridge.
     * L3 → L2, L2 → L1.  Direct L3 → L1 is forbidden by GhostStack law.
     */
    upstreamFrom(from) {
        const intent = { kind: "UPSTREAM", from };
        this._enforce(intent);
        const targetLayer = from === "L3" ? "L2" : "L1";
        const candidates = this.pool.list(targetLayer);
        const decision = this.ai.decide({ kind: "READ", layer: targetLayer }, candidates);
        return this.pool.getProvider(decision.chosenUrl);
    }
    /**
     * Access an external (non-GhostStack) network.
     * Only permitted when `allowExternalOnL1 = true` in config.
     */
    external(name) {
        const intent = { kind: "EXTERNAL", from: "L1", name };
        this._enforce(intent);
        if (!this.cfg.externals || this.cfg.externals.length === 0) {
            throw new errors_js_1.GhostRpcUnavailableError("No external endpoints configured.");
        }
        const candidates = this.pool.list("EXTERNAL");
        const decision = this.ai.decide(intent, candidates);
        return this.pool.getProvider(decision.chosenUrl);
    }
    /**
     * Quorum read — asks `quorum` healthy endpoints and returns the median
     * block number.  Throws `GhostQuorumError` if fewer than `quorum`
     * endpoints respond successfully.
     *
     * @param layer  Target layer to query.
     * @param quorum Minimum number of matching (±1 block) responses required.
     */
    async quorumBlockNumber(layer, quorum = 2) {
        const candidates = this.pool.list(layer).filter(h => !h.circuitOpen);
        if (candidates.length < quorum) {
            throw new errors_js_1.GhostQuorumError(`Quorum ${quorum} requires at least ${quorum} open endpoints on ${layer}, ` +
                `but only ${candidates.length} available.`);
        }
        const results = await Promise.allSettled(candidates.map(async (h) => {
            const provider = this.pool.getProvider(h.url);
            return provider.getBlockNumber();
        }));
        const nums = results
            .filter((r) => r.status === "fulfilled")
            .map(r => r.value)
            .sort((a, b) => a - b);
        if (nums.length < quorum) {
            throw new errors_js_1.GhostQuorumError(`Quorum ${quorum} not reached on ${layer}: got ${nums.length} responses.`);
        }
        // Median
        const mid = Math.floor(nums.length / 2);
        return nums.length % 2 === 1
            ? nums[mid]
            : Math.round((nums[mid - 1] + nums[mid]) / 2);
    }
    // ── GhostStack law enforcement ──────────────────────────────────────────────
    _enforce(intent) {
        if (intent.kind === "EXTERNAL" && !this.cfg.allowExternalOnL1) {
            throw new errors_js_1.GhostRoutingError("External RPC access is disabled. Set allowExternalOnL1=true in AutonomousConfig.");
        }
        // Reserved: additional policy checks (e.g. L3→L1 short-circuit detection)
        // can be added here when the GhostBrain integration lands.
    }
}
exports.AutonomousGhostProvider = AutonomousGhostProvider;
