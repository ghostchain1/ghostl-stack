import { GhostNetworkError } from "../errors";

export class GhostRpcTransport {
  private timeout: number;

  constructor(private url: string, options: { timeoutMs?: number } = {}) {
    this.timeout = options.timeoutMs ?? 30_000;
  }

  async send(payload: unknown): Promise<unknown> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeout);

    try {
      const res = await fetch(this.url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
        signal: controller.signal
      });

      if (!res.ok) {
        throw new GhostNetworkError(`HTTP ${res.status}: ${res.statusText}`);
      }

      return res.json();
    } catch (err) {
      if ((err as Error).name === "AbortError") {
        throw new GhostNetworkError(`RPC request timed out after ${this.timeout}ms`);
      }
      throw err;
    } finally {
      clearTimeout(timer);
    }
  }
}
