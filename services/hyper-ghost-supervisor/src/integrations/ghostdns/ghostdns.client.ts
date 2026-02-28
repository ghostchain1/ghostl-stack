import crypto from 'node:crypto';

type GhostDnsClientOpts = {
  baseUrl: string;
  sharedSecret?: string;
  timeoutMs?: number;
};

export class GhostDnsClient {
  private readonly baseUrl: string;
  private readonly sharedSecret?: string;
  private readonly timeoutMs: number;

  constructor(opts: GhostDnsClientOpts) {
    this.baseUrl = opts.baseUrl.replace(/\/$/, '');
    this.sharedSecret = opts.sharedSecret;
    this.timeoutMs = opts.timeoutMs ?? 8000;
  }

  private headers(body: string): Headers {
    const headers = new Headers({ 'content-type': 'application/json' });
    if (!this.sharedSecret) return headers;
    const nonce = crypto.randomUUID();
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const signature = crypto.createHmac('sha256', this.sharedSecret).update(`${nonce}:${timestamp}:${body}`).digest('hex');
    headers.set('X-GST-APPROVAL', signature);
    headers.set('X-GST-NONCE', nonce);
    headers.set('X-GST-TIMESTAMP', timestamp);
    return headers;
  }

  private async request<T>(path: string, init?: RequestInit): Promise<T> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const response = await fetch(`${this.baseUrl}${path}`, { ...init, signal: controller.signal });
      if (!response.ok) throw new Error(`ghostdns_http_${response.status}`);
      return (await response.json()) as T;
    } finally {
      clearTimeout(timer);
    }
  }

  health() {
    return this.request('/health');
  }

  metrics() {
    return fetch(`${this.baseUrl}/metrics`).then((res) => res.text());
  }

  reconcile() {
    return this.request('/reconcile', { method: 'POST' });
  }

  zone() {
    return this.request('/zone');
  }

  async upsertRecord(payload: Record<string, unknown>) {
    const body = JSON.stringify(payload);
    return this.request('/records/upsert', { method: 'POST', headers: this.headers(body), body });
  }

  async deleteRecord(payload: Record<string, unknown>) {
    const body = JSON.stringify(payload);
    return this.request('/records/delete', { method: 'POST', headers: this.headers(body), body });
  }

  async reload() {
    const body = '{}';
    return this.request('/reload', { method: 'POST', headers: this.headers(body), body });
  }
}
