/**
 * GhostRPCMonitor
 *
 * Measures JSON-RPC endpoint health: latency, availability, and block lag.
 * Used by GhostBrain to rotate endpoints and maintain uptime.
 *
 * Usage:
 *   const monitor = new GhostRPCMonitor();
 *   const health  = await monitor.check("http://localhost:18545");
 *   console.log(health.latencyMs, health.available, health.blockLag);
 */

// ── Types ─────────────────────────────────────────────────────────────────────

export interface RpcHealthResult {
  url:        string;
  available:  boolean;
  latencyMs:  number;
  blockNumber: number | null;
  /** Block lag relative to a reference block (if provided) */
  blockLag:   number | null;
  /** Error message if unavailable */
  error?:     string;
  /** Timestamp of the check */
  checkedAt:  number;
}

export interface RpcMonitorConfig {
  /** Request timeout in milliseconds. Default: 5000 */
  timeoutMs?: number;
  /** JSON-RPC method to call. Default: "ghost_blockNumber" */
  method?: string;
  /** Custom request params. Default: [] */
  params?: unknown[];
}

// ── GhostRPCMonitor ───────────────────────────────────────────────────────────

export class GhostRPCMonitor {
  private readonly timeoutMs: number;
  private readonly method:    string;
  private readonly params:    unknown[];

  constructor(config: RpcMonitorConfig = {}) {
    this.timeoutMs = config.timeoutMs ?? 5_000;
    this.method    = config.method    ?? "ghost_blockNumber";
    this.params    = config.params    ?? [];
  }

  /**
   * Measure the health of a single RPC endpoint.
   *
   * @param url          The JSON-RPC endpoint URL.
   * @param referenceBlock Optional: current expected block number for lag calc.
   */
  async check(url: string, referenceBlock?: number): Promise<RpcHealthResult> {
    const start     = Date.now();
    const checkedAt = start;

    try {
      const body = JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: this.method,
        params: this.params,
      });

      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), this.timeoutMs);

      let res: Response;
      try {
        res = await fetch(url, {
          method:  "POST",
          headers: { "content-type": "application/json" },
          body,
          signal: controller.signal,
        });
      } finally {
        clearTimeout(timer);
      }

      const latencyMs  = Date.now() - start;
      const json       = await res.json() as { result?: string; error?: unknown };
      const blockNumber = json.result ? parseInt(json.result, 16) : null;
      const blockLag    = (referenceBlock !== undefined && blockNumber !== null)
        ? referenceBlock - blockNumber
        : null;

      return { url, available: true, latencyMs, blockNumber, blockLag, checkedAt };
    } catch (err) {
      const latencyMs = Date.now() - start;
      const error     = err instanceof Error ? err.message : String(err);
      return { url, available: false, latencyMs, blockNumber: null, blockLag: null, error, checkedAt };
    }
  }

  /**
   * Check multiple endpoints in parallel.
   * Returns sorted by latency (fastest first, unavailable last).
   */
  async checkAll(urls: string[], referenceBlock?: number): Promise<RpcHealthResult[]> {
    const results = await Promise.all(urls.map(u => this.check(u, referenceBlock)));
    return results.sort((a, b) => {
      if (a.available !== b.available) return a.available ? -1 : 1;
      return a.latencyMs - b.latencyMs;
    });
  }

  /**
   * Pick the fastest available endpoint from a list.
   * Returns `null` if all endpoints are down.
   */
  async pickBest(urls: string[]): Promise<string | null> {
    const results = await this.checkAll(urls);
    return results.find(r => r.available)?.url ?? null;
  }
}
