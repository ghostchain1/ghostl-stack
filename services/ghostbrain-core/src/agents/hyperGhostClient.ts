/**
 * GhostBrain Core — HyperGhostClient
 *
 * HTTP client for the hyper-ghost-ai agent service.
 *
 * GhostBrain Core is the only caller authorised to reach hyper-ghost-ai when
 * HYPER_GHOST_REQUIRE_BRAIN_TOKEN=1 is set on that service.
 *
 * Circuit-breaker pattern: consecutive failures → backoff → breaker open
 */

import { request } from "undici";

export interface DispatchPayload {
  requestId: string;
  action:    string;
  params:    Record<string, unknown>;
  role?:     string; // forwarded to hyper-ghost-ai; defaults to "GOVERNOR"
}

export interface DispatchResult {
  ok:     boolean;
  result?: unknown;
  error?: string;
}

export class HyperGhostClient {
  private readonly baseUrl:        string;
  private readonly brainToken:     string;
  private readonly governorToken:  string;
  private readonly role:           string;

  // Minimal circuit-breaker state
  private failureCount = 0;
  private openUntil    = 0;
  private readonly maxFailures  = 3;
  private readonly openMs       = 30_000; // 30 s back-off

  constructor(opts: {
    baseUrl:       string;
    brainToken:    string;
    governorToken: string;
    role?:         string;
  }) {
    this.baseUrl       = opts.baseUrl.replace(/\/$/, "");
    this.brainToken    = opts.brainToken;
    this.governorToken = opts.governorToken;
    this.role          = opts.role ?? "GOVERNOR";
  }

  // ── Circuit breaker ────────────────────────────────────────────────────────

  private isOpen(): boolean {
    if (this.failureCount < this.maxFailures) return false;
    if (Date.now() < this.openUntil) return true;
    // Half-open — allow one attempt through
    return false;
  }

  private recordSuccess() { this.failureCount = 0; this.openUntil = 0; }
  private recordFailure() {
    this.failureCount++;
    if (this.failureCount >= this.maxFailures) {
      this.openUntil = Date.now() + this.openMs;
    }
  }

  // ── API methods ────────────────────────────────────────────────────────────

  async status(): Promise<unknown> {
    const r = await request(`${this.baseUrl}/status`, { method: "GET" });
    return r.body.json();
  }

  /**
   * Dispatch a role-based action to hyper-ghost-ai.
   *
   * Passes the brain token so hyper-ghost-ai can verify this is a GhostBrain
   * authorised request (when HYPER_GHOST_REQUIRE_BRAIN_TOKEN=1).
   */
  async dispatchAction(payload: DispatchPayload): Promise<DispatchResult> {
    if (this.isOpen()) {
      return { ok: false, error: "HyperGhostClient: circuit breaker open — agent temporarily unavailable" };
    }

    const body = JSON.stringify({
      ...payload,
      role: payload.role ?? this.role,
    });

    try {
      const r = await request(`${this.baseUrl}/action`, {
        method:  "POST",
        headers: {
          "content-type":      "application/json",
          "x-role":            payload.role ?? this.role,
          "x-brain-token":     this.brainToken,
          "x-governor-token":  this.governorToken,
          "x-request-id":      payload.requestId,
        },
        body,
      });

      const json = await r.body.json() as DispatchResult;
      if (r.statusCode >= 200 && r.statusCode < 300 && json.ok) {
        this.recordSuccess();
      } else {
        this.recordFailure();
      }
      return json;
    } catch (err) {
      this.recordFailure();
      return { ok: false, error: (err as Error).message };
    }
  }

  /**
   * Submit an auditor veto for a pending action.
   */
  async vetoAction(requestIdToVeto: string, auditorId: string, reason: string): Promise<DispatchResult> {
    try {
      const body = JSON.stringify({ auditorId, reason });
      const r = await request(
        `${this.baseUrl}/veto/${encodeURIComponent(requestIdToVeto)}`,
        {
          method:  "POST",
          headers: {
            "content-type":  "application/json",
            "x-role":        "AUDITOR",
            "x-brain-token": this.brainToken,
          },
          body,
        },
      );
      return r.body.json() as Promise<DispatchResult>;
    } catch (err) {
      return { ok: false, error: (err as Error).message };
    }
  }
}
