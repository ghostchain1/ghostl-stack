import type { GhostProviderOptions, GhostRpcResponse } from "./types.js";
import { GhostRpcError, GhostTransportError } from "../errors/GhostErrors.js";
import { withRetry, type RetryOptions } from "./retry.js";
import { GhostCircuitBreaker, type CircuitBreakerOptions } from "./circuitBreaker.js";
import { createGhostNativeLogger, type GhostNativeLogger } from "./logger.js";

export type GhostJsonRpcOptions = Partial<GhostProviderOptions> & {
  retry?: RetryOptions;
  breaker?: CircuitBreakerOptions;
  logger?: GhostNativeLogger;
};

export class GhostJsonRpc {
  private id = 1;
  private readonly timeoutMs: number;
  private readonly headers: Record<string, string>;
  private readonly retry: RetryOptions;
  private readonly breaker: GhostCircuitBreaker;
  private readonly log: GhostNativeLogger;

  constructor(private readonly rpcUrl: string, opts: GhostJsonRpcOptions = {}) {
    this.timeoutMs = opts.timeoutMs ?? 20_000;
    this.headers = { "content-type": "application/json", ...(opts.headers ?? {}) };
    this.retry = opts.retry ?? { retries: 2, minDelayMs: 250, maxDelayMs: 2500 };
    this.breaker = new GhostCircuitBreaker(opts.breaker ?? { failureThreshold: 5, coolDownMs: 10_000 });
    this.log = opts.logger ?? createGhostNativeLogger("info");
  }

  async request<T>(method: string, params: unknown[] = []): Promise<T> {
    if (!this.breaker.canRun()) throw new GhostTransportError("RPC circuit breaker open");

    const exec = async () => {
      const id = this.id++;
      const controller = new AbortController();
      const t = setTimeout(() => controller.abort(), this.timeoutMs);
      try {
        const res = await fetch(this.rpcUrl, {
          method: "POST",
          headers: this.headers,
          body: JSON.stringify({ jsonrpc: "2.0", id, method, params }),
          signal: controller.signal,
        });
        const text = await res.text();
        let json: GhostRpcResponse<T>;
        try { json = JSON.parse(text) as GhostRpcResponse<T>; }
        catch { throw new GhostTransportError(`Invalid JSON-RPC response: ${text.slice(0, 200)}`); }
        if (!res.ok) {
          this.breaker.onFailure();
          throw new GhostTransportError(`RPC HTTP ${res.status}`);
        }
        if (json.error) {
          this.breaker.onFailure();
          throw new GhostRpcError(json.error.message, json.error.code, json.error.data);
        }
        this.breaker.onSuccess();
        return json.result as T;
      } catch (e) {
        this.log.warn("RPC request failed", { method, error: e });
        throw e;
      } finally {
        clearTimeout(t);
      }
    };
    return withRetry(exec, this.retry);
  }
}
