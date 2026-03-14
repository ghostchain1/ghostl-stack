/**
 * GhostBrainClient
 *
 * High-level client for the GhostBrain Core AI service.
 * Wraps the REST API with typed methods for:
 *   - Transaction AI guidance
 *   - RPC pool routing decisions
 *   - Bridge congestion signals
 *   - Telemetry ingestion
 *
 * This is a higher-level companion to GhostBrainAiEngine (in autonomous/).
 * Use GhostBrainAiEngine for low-level routing decisions.
 * Use GhostBrainClient for operational observability and control.
 *
 * Usage:
 *   const brain = new GhostBrainClient("http://ghostbrain-core:4000");
 *   await brain.reportTelemetry({ ... });
 *   const advice = await brain.requestGasAdvice({ ... });
 */

// ── Types ─────────────────────────────────────────────────────────────────────

export interface GhostBrainClientConfig {
  /** GhostBrain Core base URL. Default: GHOSTBRAIN_CORE_URL env var or localhost:4000 */
  endpoint?: string;
  /** HMAC secret for signed requests. Default: CONTROL_PLANE_HMAC_SECRET env var. */
  hmacSecret?: string;
  /** Request timeout in milliseconds. Default: 8000 */
  timeoutMs?: number;
}

export interface BrainTelemetry {
  /** Source layer */
  layer?:        string;
  /** Transaction hash if applicable */
  txHash?:       string;
  /** Gas used in this tx/block */
  gasUsed?:      string | bigint;
  /** Base fee at time of recording */
  baseFee?:      string | bigint;
  /** Mempool size snapshot */
  mempoolSize?:  number;
  /** Validator peer count */
  peerCount?:    number;
  /** Bridge queue fill % */
  bridgeLoad?:   number;
  /** Custom key-value annotations */
  meta?:         Record<string, string | number | boolean>;
}

export interface GasAdviceRequest {
  layer:       string;
  mempoolSize: number;
  baseFee:     string;
  urgency?:    "low" | "normal" | "high";
}

export interface GasAdviceResponse {
  maxFeePerGas:         string;
  maxPriorityFeePerGas: string;
  confidence:           number;
  source:               "ghostbrain" | "heuristic";
}

export interface BrainRpcDecision {
  recommendedUrl: string;
  reason:         string;
  confidence:     number;
}

// ── GhostBrainClient ──────────────────────────────────────────────────────────

export class GhostBrainClient {
  private readonly endpoint:  string;
  private readonly hmacSecret: string | null;
  private readonly timeoutMs: number;

  constructor(config: GhostBrainClientConfig | string = {}) {
    if (typeof config === "string") {
      this.endpoint   = config;
      this.hmacSecret = null;
      this.timeoutMs  = 8_000;
    } else {
      this.endpoint   = config.endpoint
        ?? (typeof process !== "undefined" ? (process.env["GHOSTBRAIN_CORE_URL"] ?? "http://localhost:4000") : "http://localhost:4000");
      this.hmacSecret = config.hmacSecret
        ?? (typeof process !== "undefined" ? (process.env["CONTROL_PLANE_HMAC_SECRET"] ?? null) : null);
      this.timeoutMs  = config.timeoutMs ?? 8_000;
    }
  }

  // ── Telemetry ─────────────────────────────────────────────────────────────

  /**
   * Report operational telemetry to GhostBrain Core for learning + observability.
   */
  async reportTelemetry(data: BrainTelemetry): Promise<void> {
    await this._post("/telemetry", {
      ...data,
      gasUsed:  data.gasUsed?.toString(),
      baseFee:  data.baseFee?.toString(),
      timestamp: Date.now(),
    });
  }

  // ── Gas advice ────────────────────────────────────────────────────────────

  /**
   * Request an AI-powered gas fee recommendation.
   * Falls back gracefully when GhostBrain is offline.
   */
  async requestGasAdvice(req: GasAdviceRequest): Promise<GasAdviceResponse | null> {
    return this._post<GasAdviceResponse>("/api/v1/gas/advice", req);
  }

  // ── RPC routing ───────────────────────────────────────────────────────────

  /**
   * Ask GhostBrain to pick the best RPC endpoint from a list.
   */
  async requestRpcDecision(urls: string[], layer: string): Promise<BrainRpcDecision | null> {
    return this._post<BrainRpcDecision>("/api/v1/rpc/pick", { urls, layer });
  }

  // ── Health ────────────────────────────────────────────────────────────────

  /** Check if GhostBrain Core is reachable and healthy. */
  async ping(): Promise<boolean> {
    try {
      const res = await fetch(`${this.endpoint}/health`, {
        signal: AbortSignal.timeout?.(3_000) ?? undefined,
      });
      return res.ok;
    } catch {
      return false;
    }
  }

  // ── Internal ──────────────────────────────────────────────────────────────

  private async _post<T>(path: string, body: unknown): Promise<T | null> {
    try {
      const json      = JSON.stringify(body);
      const headers   = this._buildHeaders(json);
      const controller = new AbortController();
      const timer      = setTimeout(() => controller.abort(), this.timeoutMs);

      let res: Response;
      try {
        res = await fetch(`${this.endpoint}${path}`, {
          method: "POST",
          headers,
          body: json,
          signal: controller.signal,
        });
      } finally {
        clearTimeout(timer);
      }

      if (!res.ok) return null;
      return res.json() as Promise<T>;
    } catch {
      return null; // Graceful offline fallback
    }
  }

  private _buildHeaders(body: string): Record<string, string> {
    const base: Record<string, string> = { "content-type": "application/json" };
    if (!this.hmacSecret) return base;

    try {
      const { createHmac } = require("node:crypto") as typeof import("node:crypto");
      const ts  = Date.now();
      const sig = createHmac("sha256", this.hmacSecret).update(`${ts}:${body}`).digest("hex");
      return { ...base, "x-hmac-timestamp": String(ts), "x-hmac-signature": sig, "x-agent-id": "ghost-sdk-client" };
    } catch {
      return base;
    }
  }
}
