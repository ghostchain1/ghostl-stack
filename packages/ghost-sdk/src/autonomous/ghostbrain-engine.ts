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

import { createHmac }      from "node:crypto";
import { HeuristicAiEngine } from "./ai-engine.js";
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

// ── HMAC signing ──────────────────────────────────────────────────────────────

function buildHmacHeaders(body: string, secret: string): Record<string, string> {
  const ts  = Date.now();
  const sig = createHmac("sha256", secret).update(`${ts}:${body}`).digest("hex");
  return {
    "content-type":     "application/json",
    "x-hmac-timestamp": String(ts),
    "x-hmac-signature": sig,
    "x-agent-id":       "ghost-sdk",
  };
}

// ── Engine ────────────────────────────────────────────────────────────────────

export class GhostBrainAiEngine implements GhostAiEngine {
  private readonly endpoint:  string;
  private readonly secret:    string;
  private readonly timeoutMs: number;
  private readonly fallback:  GhostAiEngine;
  private _failingSince: number | null = null;

  constructor(cfg: GhostBrainEngineConfig = {}) {
    this.endpoint  = (cfg.url ?? process.env["GHOSTBRAIN_CORE_URL"] ?? "http://localhost:4000") +
                     "/api/v1/rpc/decide";
    this.secret    = cfg.hmacSecret ?? process.env["CONTROL_PLANE_HMAC_SECRET"] ?? "";
    this.timeoutMs = cfg.timeoutMs ?? 1_000;
    this.fallback  = cfg.fallback  ?? new HeuristicAiEngine();
  }

  decide(intent: RouteIntent, candidates: RpcHealth[]): AiDecision {
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
  async decideAsync(intent: RouteIntent, candidates: RpcHealth[]): Promise<AiDecision> {
    try {
      const body    = JSON.stringify({ intent, candidates });
      const headers: Record<string, string> = {
        "content-type": "application/json",
        ...(this.secret ? buildHmacHeaders(body, this.secret) : {}),
      };

      const ac  = new AbortController();
      const tid = setTimeout(() => ac.abort(), this.timeoutMs);

      const res = await fetch(this.endpoint, {
        method:  "POST",
        headers,
        body,
        signal:  ac.signal,
      });
      clearTimeout(tid);

      if (!res.ok) throw new Error(`ghostbrain-core ${res.status}`);

      const decision = await res.json() as AiDecision;
      this._failingSince = null;
      return decision;
    } catch (err) {
      if (!this._failingSince) {
        this._failingSince = Date.now();
        console.warn("[ghost-sdk] GhostBrainAiEngine: falling back to heuristic —", (err as Error).message);
      }
      return this.fallback.decide(intent, candidates);
    }
  }

  /** True if GhostBrain Core has been unreachable since more than `ms` ago. */
  isDegraded(ms = 10_000): boolean {
    return this._failingSince !== null && Date.now() - this._failingSince > ms;
  }

  private async _prefetch(intent: RouteIntent, candidates: RpcHealth[]): Promise<void> {
    try {
      const body    = JSON.stringify({ intent, candidates });
      const headers: Record<string, string> = {
        "content-type": "application/json",
        ...(this.secret ? buildHmacHeaders(body, this.secret) : {}),
      };
      const ac  = new AbortController();
      setTimeout(() => ac.abort(), this.timeoutMs);
      await fetch(this.endpoint, { method: "POST", headers, body, signal: ac.signal });
    } catch { /* silent */ }
  }
}
