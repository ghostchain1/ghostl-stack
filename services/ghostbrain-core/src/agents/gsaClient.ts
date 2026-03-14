/**
 * GhostBrain Core — GsaClient
 *
 * HTTP client used by ghostbrain-core to push commands to ghostbrain-gsa.
 *
 * Auth: outbound HMAC-SHA256 (X-HMAC-Signature / X-HMAC-Timestamp).
 *       Same scheme as ghostbrain-gsa's outboundHeaders().
 *
 * Circuit-breaker: 3 consecutive failures → 30 s backoff.
 *
 * Env vars consumed:
 *   GSA_BASE_URL              e.g. http://ghostbrain-gsa:7850
 *   CONTROL_PLANE_HMAC_SECRET  shared secret for mutual HMAC auth
 */

import { request } from "undici";
import { outboundHmacHeaders } from "../middleware/hmac.js";

export interface GsaScanResult {
  ok:            boolean;
  correlationId: string;
  summary?:      unknown;
  artifactHash?: string;
  error?:        string;
}

export interface GsaPlanResult {
  ok:          boolean;
  planId?:     string;
  stepCount?:  number;
  artifactHash?: string;
  error?:      string;
}

export interface GsaVerifyResult {
  ok:            boolean;
  correlationId: string;
  checks?:       unknown;
  error?:        string;
}

export interface GsaApplyResult {
  ok:    boolean;
  error?: string;
  [key: string]: unknown;
}

export interface GsaStatusResult {
  ok:           boolean;
  agentId?:     string;
  applyEnabled?: boolean;
  lastScanAt?:  string | null;
  lastScanOk?:  boolean | null;
  error?:       string;
}

export interface GsaCommandResult {
  ok:     boolean;
  result?: unknown;
  error?: string;
}

const GSA_BASE_URL = process.env.GSA_BASE_URL ?? "http://ghostbrain-gsa:7850";

export class GsaClient {
  private readonly baseUrl: string;
  private failureCount = 0;
  private openUntil    = 0;
  private readonly maxFailures = 3;
  private readonly openMs      = 30_000;

  constructor(baseUrl = GSA_BASE_URL) {
    this.baseUrl = baseUrl.replace(/\/$/, "");
  }

  // ── Circuit breaker ───────────────────────────────────────────────────────

  private isOpen(): boolean {
    if (this.failureCount < this.maxFailures) return false;
    if (Date.now() < this.openUntil) return true;
    return false; // half-open
  }

  private recordSuccess() { this.failureCount = 0; this.openUntil = 0; }
  private recordFailure() {
    this.failureCount++;
    if (this.failureCount >= this.maxFailures) {
      this.openUntil = Date.now() + this.openMs;
    }
  }

  // ── Internal helpers ──────────────────────────────────────────────────────

  private async post<T>(path: string, body: object = {}): Promise<T> {
    if (this.isOpen()) {
      throw new Error("GsaClient: circuit breaker open — GSA temporarily unavailable");
    }
    const bodyStr = JSON.stringify(body);
    try {
      const r = await request(`${this.baseUrl}${path}`, {
        method:  "POST",
        headers: outboundHmacHeaders(bodyStr),
        body:    bodyStr,
        bodyTimeout:   10_000,
        headersTimeout: 5_000,
      });
      const json = (await r.body.json()) as T;
      this.recordSuccess();
      return json;
    } catch (err) {
      this.recordFailure();
      throw err;
    }
  }

  private async get<T>(path: string): Promise<T> {
    if (this.isOpen()) {
      throw new Error("GsaClient: circuit breaker open");
    }
    try {
      const r = await request(`${this.baseUrl}${path}`, {
        method:  "GET",
        headers: outboundHmacHeaders(),
      });
      const json = (await r.body.json()) as T;
      this.recordSuccess();
      return json;
    } catch (err) {
      this.recordFailure();
      throw err;
    }
  }

  // ── Public API ────────────────────────────────────────────────────────────

  /** GET /health → quick liveness probe */
  async health(): Promise<{ ok: boolean }> {
    return this.get<{ ok: boolean }>("/health");
  }

  /** GET /status → agent status + config */
  async status(): Promise<GsaStatusResult> {
    return this.get<GsaStatusResult>("/status");
  }

  /**
   * POST /scan → run read-only analysis pipeline on the repo.
   * @param opts  optional extra params forwarded to GSA
   */
  async scan(opts: Record<string, unknown> = {}): Promise<GsaScanResult> {
    return this.post<GsaScanResult>("/scan", opts);
  }

  /**
   * POST /plan → generate patch plan from last scan result.
   * Must call scan() first; GSA returns 409 if no scan exists.
   */
  async plan(opts: Record<string, unknown> = {}): Promise<GsaPlanResult> {
    return this.post<GsaPlanResult>("/plan", opts);
  }

  /**
   * POST /verify → run tests + audit regression check.
   */
  async verify(opts: Record<string, unknown> = {}): Promise<GsaVerifyResult> {
    return this.post<GsaVerifyResult>("/verify", opts);
  }

  /**
   * POST /apply → apply a plan step (requires GSA_APPLY_ENABLED=true on GSA side).
   * @param step   step descriptor from the plan
   * @param bundle governance bundle (OGB)
   */
  async apply(step: unknown, bundle: unknown): Promise<GsaApplyResult> {
    return this.post<GsaApplyResult>("/apply", { step, bundle });
  }

  /**
   * POST /commands → push a brain command to the GSA.
   * GSA will process it according to its policy engine.
   */
  async sendCommand(command: {
    type:          string;
    correlationId: string;
    payload?:      unknown;
  }): Promise<GsaCommandResult> {
    return this.post<GsaCommandResult>("/commands", command);
  }

  /**
   * POST /bundle/verify → offline governance bundle verification.
   */
  async verifyBundle(bundleJson: string): Promise<{ ok: boolean; bundleHash?: string; error?: string }> {
    const bodyStr = bundleJson;
    const r = await request(`${this.baseUrl}/bundle/verify`, {
      method:  "POST",
      headers: { ...outboundHmacHeaders(bodyStr), "content-type": "application/json" },
      body:    bodyStr,
    });
    return r.body.json() as Promise<{ ok: boolean; bundleHash?: string; error?: string }>;
  }
}

// ── Lazy singleton ────────────────────────────────────────────────────────────

let _gsaClient: GsaClient | null = null;

export function getGsaClient(): GsaClient {
  if (!_gsaClient) {
    _gsaClient = new GsaClient(process.env.GSA_BASE_URL ?? "http://ghostbrain-gsa:7850");
  }
  return _gsaClient;
}
