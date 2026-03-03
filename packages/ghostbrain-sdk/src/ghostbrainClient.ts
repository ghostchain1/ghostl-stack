/**
 * GhostBrain SDK — GhostContractAI HTTP Client
 *
 * Typed wrapper around the /v1/jobs REST API.
 * Uses Node.js built-in fetch. Zero runtime dependencies.
 */

import type {
  CreateJobRequest,
  CreateJobResponse,
  Job,
  JobEvidence,
  JobStatus,
} from "./types.js";

export interface GhostContractAIClientOptions {
  /** Base URL of the ghostcontract-ai service, e.g. "http://ghostcontract-ai:7610" */
  baseUrl: string;
  /** Shared secret for X-Ghostbrain-Secret header */
  sharedSecret?: string;
  /** Default request timeout in ms (default 30 000) */
  timeoutMs?: number;
}

export class GhostContractAIClient {
  private readonly base: string;
  private readonly secret: string;
  private readonly timeoutMs: number;

  constructor(opts: GhostContractAIClientOptions) {
    this.base = opts.baseUrl.replace(/\/$/, "");
    this.secret = opts.sharedSecret ?? "";
    this.timeoutMs = opts.timeoutMs ?? 30_000;
  }

  // ─── Job Lifecycle ─────────────────────────────────────────────────────────

  async createJob(req: CreateJobRequest): Promise<CreateJobResponse> {
    return this._post<CreateJobResponse>("/v1/jobs", req);
  }

  async getJob(jobId: string): Promise<Job> {
    return this._get<Job>(`/v1/jobs/${jobId}`);
  }

  async listJobs(): Promise<{ jobs: Job[]; total: number; queueDepth: number }> {
    return this._get(`/v1/jobs`);
  }

  async cancelJob(jobId: string): Promise<{ id: string; status: JobStatus }> {
    return this._delete(`/v1/jobs/${jobId}`);
  }

  async getEvidence(jobId: string): Promise<JobEvidence> {
    return this._get<JobEvidence>(`/v1/jobs/${jobId}/evidence`);
  }

  // ─── Polling helper ────────────────────────────────────────────────────────

  /**
   * Poll until job reaches a terminal state or timeout expires.
   * Resolves with the final Job record.
   */
  async waitForJob(
    jobId: string,
    opts: { pollMs?: number; timeoutMs?: number } = {},
  ): Promise<Job> {
    const pollMs = opts.pollMs ?? 3_000;
    const deadline = Date.now() + (opts.timeoutMs ?? 900_000);

    const terminal: JobStatus[] = [
      "succeeded",
      "failed",
      "cancelled",
      "dry_run_complete",
    ];

    while (Date.now() < deadline) {
      const job = await this.getJob(jobId);
      if (terminal.includes(job.status)) return job;
      await _sleep(pollMs);
    }

    throw new Error(`waitForJob: timeout after ${opts.timeoutMs ?? 900_000}ms for job ${jobId}`);
  }

  // ─── HTTP helpers ──────────────────────────────────────────────────────────

  private async _get<T>(path: string): Promise<T> {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), this.timeoutMs);
    try {
      const res = await fetch(`${this.base}${path}`, {
        method: "GET",
        headers: this._headers(),
        signal: ctrl.signal,
      });
      return this._parse<T>(res);
    } finally {
      clearTimeout(timer);
    }
  }

  private async _post<T>(path: string, body: unknown): Promise<T> {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), this.timeoutMs);
    try {
      const res = await fetch(`${this.base}${path}`, {
        method: "POST",
        headers: { ...this._headers(), "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: ctrl.signal,
      });
      return this._parse<T>(res);
    } finally {
      clearTimeout(timer);
    }
  }

  private async _delete<T>(path: string): Promise<T> {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), this.timeoutMs);
    try {
      const res = await fetch(`${this.base}${path}`, {
        method: "DELETE",
        headers: this._headers(),
        signal: ctrl.signal,
      });
      return this._parse<T>(res);
    } finally {
      clearTimeout(timer);
    }
  }

  private _headers(): Record<string, string> {
    const h: Record<string, string> = {};
    if (this.secret) h["x-ghostbrain-secret"] = this.secret;
    return h;
  }

  private async _parse<T>(res: Response): Promise<T> {
    const text = await res.text();
    if (!res.ok) {
      throw new Error(
        `GhostContractAI API error ${res.status}: ${text.slice(0, 400)}`,
      );
    }
    try {
      return JSON.parse(text) as T;
    } catch {
      throw new Error(`GhostContractAI API returned non-JSON: ${text.slice(0, 200)}`);
    }
  }
}

function _sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
