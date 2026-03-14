"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.GhostBrainAiEngine = void 0;
const node_crypto_1 = require("node:crypto");
const ai_engine_js_1 = require("./ai-engine.js");
// ── HMAC signing ──────────────────────────────────────────────────────────────
function buildHmacHeaders(body, secret) {
    const ts = Date.now();
    const sig = (0, node_crypto_1.createHmac)("sha256", secret).update(`${ts}:${body}`).digest("hex");
    return {
        "content-type": "application/json",
        "x-hmac-timestamp": String(ts),
        "x-hmac-signature": sig,
        "x-agent-id": "ghost-sdk",
    };
}
// ── Engine ────────────────────────────────────────────────────────────────────
class GhostBrainAiEngine {
    endpoint;
    secret;
    timeoutMs;
    fallback;
    _failingSince = null;
    constructor(cfg = {}) {
        this.endpoint = (cfg.url ?? process.env["GHOSTBRAIN_CORE_URL"] ?? "http://localhost:4000") +
            "/api/v1/rpc/decide";
        this.secret = cfg.hmacSecret ?? process.env["CONTROL_PLANE_HMAC_SECRET"] ?? "";
        this.timeoutMs = cfg.timeoutMs ?? 1_000;
        this.fallback = cfg.fallback ?? new ai_engine_js_1.HeuristicAiEngine();
    }
    decide(intent, candidates) {
        // decide() is synchronous per the interface; we schedule a fire-and-forget
        // prefetch that warms GhostBrain's snapshot store, then return from the
        // local heuristic immediately.  For environments that want full async, use
        // decideAsync() directly.
        //
        // The rationale: routing decisions need to be synchronous for providerFor()
        // callers; the GhostBrain round-trip (< 5 ms on LAN) is worth it only when
        // you wrap decideAsync() yourself.
        void this._prefetch(intent, candidates);
        return this.fallback.decide(intent, candidates);
    }
    /**
     * Fully async variant — awaits the GhostBrain response, falls back locally
     * on error.  Use this when you can afford a tiny extra round-trip, e.g. in
     * event-driven contexts.
     */
    async decideAsync(intent, candidates) {
        try {
            const body = JSON.stringify({ intent, candidates });
            const headers = {
                "content-type": "application/json",
                ...(this.secret ? buildHmacHeaders(body, this.secret) : {}),
            };
            const ac = new AbortController();
            const tid = setTimeout(() => ac.abort(), this.timeoutMs);
            const res = await fetch(this.endpoint, {
                method: "POST",
                headers,
                body,
                signal: ac.signal,
            });
            clearTimeout(tid);
            if (!res.ok)
                throw new Error(`ghostbrain-core ${res.status}`);
            const decision = await res.json();
            this._failingSince = null;
            return decision;
        }
        catch (err) {
            if (!this._failingSince) {
                this._failingSince = Date.now();
                console.warn("[ghost-sdk] GhostBrainAiEngine: falling back to heuristic —", err.message);
            }
            return this.fallback.decide(intent, candidates);
        }
    }
    /** True if GhostBrain Core has been unreachable since more than `ms` ago. */
    isDegraded(ms = 10_000) {
        return this._failingSince !== null && Date.now() - this._failingSince > ms;
    }
    async _prefetch(intent, candidates) {
        try {
            const body = JSON.stringify({ intent, candidates });
            const headers = {
                "content-type": "application/json",
                ...(this.secret ? buildHmacHeaders(body, this.secret) : {}),
            };
            const ac = new AbortController();
            setTimeout(() => ac.abort(), this.timeoutMs);
            await fetch(this.endpoint, { method: "POST", headers, body, signal: ac.signal });
        }
        catch { /* silent */ }
    }
}
exports.GhostBrainAiEngine = GhostBrainAiEngine;
