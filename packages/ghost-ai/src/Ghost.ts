/**
 * @ghost/ai — Ghost class
 *
 * AI-native interface for the GhostChain ecosystem.
 *
 * ```ts
 * import Ghost from "@ghost/ai";
 *
 * const ghost = new Ghost({ name: "HyperGhostAI" });
 * ghost.on("alert", console.warn);
 *
 * const analysis = await ghost.think("analyze_transaction", { hash, value });
 * if (analysis.risk === "high") throw new Error("Blocked by Ghost AI");
 * ```
 */

import { createHmac }   from "node:crypto";
import { EventEmitter } from "node:events";
import type {
  GhostConfig,
  GhostEvents,
  GhostTask,
  ThinkRequest,
  ThinkResponse,
} from "./types.js";

// ── HMAC helper ───────────────────────────────────────────────────────────────

function signHmac(body: string, secret: string): Record<string, string> {
  const ts  = Date.now();
  const sig = createHmac("sha256", secret).update(`${ts}:${body}`).digest("hex");
  return {
    "content-type":     "application/json",
    "x-hmac-timestamp": String(ts),
    "x-hmac-signature": sig,
    "x-agent-id":       "ghost-ai-sdk",
  };
}

// ── Ghost class ───────────────────────────────────────────────────────────────

export class Ghost extends EventEmitter {
  readonly name:      string;
  private _endpoint:  string;
  private _secret:    string;
  private _timeout:   number;

  constructor(cfg: GhostConfig = {}) {
    super();
    this.name      = cfg.name        ?? "GhostAgent";
    this._endpoint = (cfg.brainEndpoint
                    ?? process.env["GHOSTBRAIN_CORE_URL"]
                    ?? "http://localhost:7900") + "/api/v1/think";
    this._secret   = cfg.hmacSecret  ?? process.env["CONTROL_PLANE_HMAC_SECRET"] ?? "";
    this._timeout  = cfg.timeoutMs   ?? 5_000;
  }

  // ── Typed .on() / .emit() ────────────────────────────────────────────────────

  on<K extends keyof GhostEvents>(
    event: K,
    listener: (...args: GhostEvents[K]) => void
  ): this {
    return super.on(event, listener as (...args: unknown[]) => void);
  }

  once<K extends keyof GhostEvents>(
    event: K,
    listener: (...args: GhostEvents[K]) => void
  ): this {
    return super.once(event, listener as (...args: unknown[]) => void);
  }

  emit<K extends keyof GhostEvents>(event: K, ...args: GhostEvents[K]): boolean {
    return super.emit(event, ...args);
  }

  // ── Core method ───────────────────────────────────────────────────────────────

  /**
   * Ask Ghost AI to reason about a task.
   *
   * @param task    Well-known or custom task identifier.
   * @param payload Arbitrary task-specific context.
   * @returns       The AI decision/analysis from GhostBrain Core.
   *
   * @example
   * const r = await ghost.think("analyze_transaction", { hash, value });
   * console.log(r.risk); // "low" | "medium" | "high" | "critical"
   */
  async think(
    task: GhostTask,
    payload: Record<string, unknown> = {}
  ): Promise<ThinkResponse> {
    const body = JSON.stringify({ task, payload, agent: this.name } satisfies ThinkRequest);

    const headers: Record<string, string> = {
      "content-type": "application/json",
      ...(this._secret ? signHmac(body, this._secret) : {}),
    };

    const ac  = new AbortController();
    const tid = setTimeout(() => ac.abort(), this._timeout);

    const t0 = performance.now();

    try {
      const res = await fetch(this._endpoint, {
        method:  "POST",
        headers,
        body,
        signal:  ac.signal,
      });
      clearTimeout(tid);

      if (!res.ok) {
        const text = await res.text().catch(() => String(res.status));
        throw new Error(`GhostBrain responded ${res.status}: ${text}`);
      }

      const response = await res.json() as ThinkResponse;
      response.latencyMs = Math.round(performance.now() - t0);

      // Emit decision always; emit alert on high/critical risk
      this.emit("decision", response);
      if (response.risk === "high" || response.risk === "critical") {
        this.emit("alert", response);
      }

      return response;
    } catch (err) {
      clearTimeout(tid);
      const error = err instanceof Error ? err : new Error(String(err));
      this.emit("error", error);
      throw error;
    }
  }
}

export default Ghost;
