import {
  type ActionRequest,
  type Incident,
  type SignedActionBundle,
  CreateActionRequestSchema,
} from "@ghostcontrol/shared";

export interface GhostControlClientOptions {
  baseUrl: string;
  token?: string;
}

export class GhostControlClient {
  readonly baseUrl: string;
  readonly token?: string;

  constructor(options: GhostControlClientOptions) {
    this.baseUrl = options.baseUrl.replace(/\/+$/, "");
    this.token = options.token;
  }

  async health(): Promise<{ ok: true; service: string; uptimeMs: number }> {
    return this.getJson("/health");
  }

  async status(): Promise<Record<string, unknown>> {
    return this.getJson("/status");
  }

  async incidents(): Promise<Incident[]> {
    return this.getJson("/incidents");
  }

  async requestAction(input: unknown): Promise<ActionRequest> {
    const parsed = CreateActionRequestSchema.parse(input);
    return this.postJson("/actions/request", parsed);
  }

  async submitBundle(bundle: SignedActionBundle): Promise<{ accepted: boolean }> {
    return this.postJson("/actions/submit", bundle);
  }

  private async getJson<T>(path: string): Promise<T> {
    const res = await fetch(`${this.baseUrl}${path}`, {
      method: "GET",
      headers: this.headers(),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
    return (await res.json()) as T;
  }

  private async postJson<T>(path: string, body: unknown): Promise<T> {
    const res = await fetch(`${this.baseUrl}${path}`, {
      method: "POST",
      headers: { ...this.headers(), "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
    return (await res.json()) as T;
  }

  private headers(): Record<string, string> {
    const headers: Record<string, string> = {};
    if (this.token) headers["x-ghostcontrol-token"] = this.token;
    return headers;
  }
}

