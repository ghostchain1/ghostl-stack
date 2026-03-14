// ─────────────────────────────────────────────────────────────────────────────
// GhostRPCFailover – Multi-endpoint RPC with automatic failover + health checks
// ─────────────────────────────────────────────────────────────────────────────
import { GhostJsonRpc } from "./GhostJsonRpc";
import { GhostFailoverExhaustedError } from "../errors";

export interface FailoverOptions {
  /** Number of retries per endpoint before moving on. Default: 2 */
  retriesPerEndpoint?: number;
  /** Delay between retries in ms. Default: 500 */
  retryDelayMs?: number;
  /** Period between health checks in ms. Default: 30_000 */
  healthCheckIntervalMs?: number;
}

export class GhostRPCFailover {
  private endpoints: { rpc: GhostJsonRpc; url: string; healthy: boolean }[];
  private opts: Required<FailoverOptions>;
  private healthTimer?: ReturnType<typeof setInterval>;

  constructor(urls: string[], opts: FailoverOptions = {}) {
    if (urls.length === 0) throw new Error("At least one RPC URL is required");
    this.endpoints = urls.map((url) => ({ url, rpc: new GhostJsonRpc(url), healthy: true }));
    this.opts = {
      retriesPerEndpoint: opts.retriesPerEndpoint ?? 2,
      retryDelayMs: opts.retryDelayMs ?? 500,
      healthCheckIntervalMs: opts.healthCheckIntervalMs ?? 30_000
    };
  }

  /** Start periodic health checks for all endpoints. */
  startHealthChecks(): void {
    if (this.healthTimer) return;
    this.healthTimer = setInterval(() => this._runHealthChecks(), this.opts.healthCheckIntervalMs);
  }

  stopHealthChecks(): void {
    if (this.healthTimer) {
      clearInterval(this.healthTimer);
      this.healthTimer = undefined;
    }
  }

  /** Fire an RPC request with automatic failover across healthy endpoints. */
  async request<T = unknown>(method: string, params: unknown[] = []): Promise<T> {
    const healthy = this.endpoints.filter((e) => e.healthy);
    if (healthy.length === 0) {
      // Fall back to all endpoints if all are marked unhealthy
      healthy.push(...this.endpoints);
    }

    let attempts = 0;
    for (const ep of healthy) {
      for (let r = 0; r < this.opts.retriesPerEndpoint; r++) {
        try {
          return await ep.rpc.request<T>(method, params);
        } catch {
          attempts++;
          if (r < this.opts.retriesPerEndpoint - 1) {
            await new Promise((res) => setTimeout(res, this.opts.retryDelayMs));
          }
        }
      }
      ep.healthy = false;
    }

    throw new GhostFailoverExhaustedError(attempts);
  }

  private async _runHealthChecks(): Promise<void> {
    for (const ep of this.endpoints) {
      try {
        await ep.rpc.request("eth_blockNumber");
        ep.healthy = true;
      } catch {
        ep.healthy = false;
      }
    }
  }

  /** Expose the list of endpoints and their health status. */
  status(): { url: string; healthy: boolean }[] {
    return this.endpoints.map(({ url, healthy }) => ({ url, healthy }));
  }
}
