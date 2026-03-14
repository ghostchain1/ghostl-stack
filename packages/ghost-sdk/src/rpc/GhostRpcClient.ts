/**
 * GhostRpcClient — low-level typed JSON-RPC 2.0 client for GhostChain.
 *
 * Features:
 * – Single and batch request support
 * – Configurable retry with exponential backoff
 * – Multiple endpoint failover
 * – Typed response generics
 */

import type { GhostRpcRequest, GhostRpcResponse } from "../native/types.js";
import { GhostValidationError } from "../errors/GhostErrors.js";

// ── Errors ────────────────────────────────────────────────────────────────────

export class GhostRpcError extends Error {
  constructor(
    message: string,
    public readonly code?: number,
    public readonly data?: unknown,
  ) {
    super(message);
    this.name = "GhostRpcError";
  }
}

// ── Types ─────────────────────────────────────────────────────────────────────

export interface GhostRpcClientConfig {
  /** Primary RPC endpoint URL. */
  url: string;
  /** Fallback endpoint URLs (tried in order on failure). */
  fallbackUrls?: string[];
  /** Request timeout in milliseconds. Default: 10_000. */
  timeoutMs?: number;
  /** Maximum number of retries per request. Default: 3. */
  maxRetries?: number;
  /** Initial retry delay in milliseconds. Default: 200. */
  retryDelayMs?: number;
  /** Custom headers to include in every request. */
  headers?: Record<string, string>;
  /** Chain ID to validate against (optional). */
  chainId?: number;
}

export interface GhostBatchCall<T = unknown> {
  method: string;
  params?: unknown[];
  _resolve?: (value: T) => void;
  _reject?: (err: Error) => void;
}

// ── GhostRpcClient ────────────────────────────────────────────────────────────

/**
 * GhostRpcClient — JSON-RPC 2.0 client with retry and batch support.
 *
 * ```ts
 * const rpc = new GhostRpcClient({ url: "http://localhost:8545" });
 * const chainId = await rpc.request<number>("eth_chainId", []);
 * const [balA, balB] = await rpc.batch([
 *   { method: "eth_getBalance", params: [addrA, "latest"] },
 *   { method: "eth_getBalance", params: [addrB, "latest"] },
 * ]);
 * ```
 */
export class GhostRpcClient {
  private readonly endpoints: string[];
  private readonly timeoutMs: number;
  private readonly maxRetries: number;
  private readonly retryDelayMs: number;
  private readonly headers: Record<string, string>;
  private _idCounter = 1;
  private _currentEndpoint = 0;

  constructor(config: GhostRpcClientConfig) {
    if (!config.url) throw new GhostValidationError("GhostRpcClient: url is required");
    this.endpoints = [config.url, ...(config.fallbackUrls ?? [])];
    this.timeoutMs = config.timeoutMs ?? 10_000;
    this.maxRetries = config.maxRetries ?? 3;
    this.retryDelayMs = config.retryDelayMs ?? 200;
    this.headers = {
      "Content-Type": "application/json",
      ...config.headers,
    };
  }

  // ── Internal ──────────────────────────────────────────────────────────────

  private nextId(): number {
    return this._idCounter++;
  }

  private get currentUrl(): string {
    return this.endpoints[this._currentEndpoint % this.endpoints.length]!;
  }

  private async fetchWithTimeout(url: string, body: string): Promise<Response> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: this.headers,
        body,
        signal: controller.signal,
      });
      return res;
    } finally {
      clearTimeout(timer);
    }
  }

  private async sendRaw<T>(payload: GhostRpcRequest): Promise<T> {
    const body = JSON.stringify(payload);
    let lastError: Error | undefined;

    for (let attempt = 0; attempt < this.maxRetries; attempt++) {
      // Try each endpoint in sequence on errors
      for (let ei = 0; ei < this.endpoints.length; ei++) {
        const url = this.endpoints[(this._currentEndpoint + ei) % this.endpoints.length]!;
        try {
          const res = await this.fetchWithTimeout(url, body);
          if (!res.ok) {
            throw new GhostRpcError(`HTTP ${res.status} ${res.statusText}`, res.status);
          }
          const json = (await res.json()) as GhostRpcResponse<T>;
          if (json.error) {
            throw new GhostRpcError(json.error.message, json.error.code, json.error.data);
          }
          // Promote successful endpoint
          this._currentEndpoint = (this._currentEndpoint + ei) % this.endpoints.length;
          return json.result as T;
        } catch (err) {
          lastError = err instanceof Error ? err : new Error(String(err));
          // Don't retry on RPC-level errors (only network errors)
          if (err instanceof GhostRpcError) throw err;
        }
      }

      if (attempt < this.maxRetries - 1) {
        await sleep(this.retryDelayMs * 2 ** attempt);
      }
    }

    throw lastError ?? new GhostRpcError("All endpoints failed");
  }

  // ── Public API ────────────────────────────────────────────────────────────

  /**
   * Send a single JSON-RPC request and return the typed result.
   */
  async request<T>(method: string, params: unknown[] = []): Promise<T> {
    const payload: GhostRpcRequest = {
      jsonrpc: "2.0",
      id: this.nextId(),
      method,
      params,
    };
    return this.sendRaw<T>(payload);
  }

  /**
   * Send multiple JSON-RPC requests in a single HTTP call (batch).
   * Returns results in the same order as the input calls.
   */
  async batch<T extends unknown[]>(
    calls: { [K in keyof T]: { method: string; params?: unknown[] } },
  ): Promise<T> {
    const ids = calls.map(() => this.nextId());
    const payload: GhostRpcRequest[] = (calls as Array<{ method: string; params?: unknown[] }>).map((call, i) => ({
      jsonrpc: "2.0",
      id: ids[i]!,
      method: call.method,
      params: call.params ?? [],
    }));

    const body = JSON.stringify(payload);
    let lastError: Error | undefined;

    for (let attempt = 0; attempt < this.maxRetries; attempt++) {
      for (let ei = 0; ei < this.endpoints.length; ei++) {
        const url = this.endpoints[(this._currentEndpoint + ei) % this.endpoints.length]!;
        try {
          const res = await this.fetchWithTimeout(url, body);
          if (!res.ok) {
            throw new GhostRpcError(`HTTP ${res.status} ${res.statusText}`, res.status);
          }
          const json = (await res.json()) as GhostRpcResponse<unknown>[];
          this._currentEndpoint = (this._currentEndpoint + ei) % this.endpoints.length;

          // Reconstruct in request order
          const byId = new Map(json.map((r) => [r.id, r]));
          return ids.map((id) => {
            const r = byId.get(id);
            if (!r) throw new GhostRpcError(`No response for id ${id}`);
            if (r.error) throw new GhostRpcError(r.error.message, r.error.code, r.error.data);
            return r.result;
          }) as unknown as T;
        } catch (err) {
          lastError = err instanceof Error ? err : new Error(String(err));
          if (err instanceof GhostRpcError) throw err;
        }
      }

      if (attempt < this.maxRetries - 1) {
        await sleep(this.retryDelayMs * 2 ** attempt);
      }
    }

    throw lastError ?? new GhostRpcError("Batch: all endpoints failed");
  }

  /**
   * Cycle to the next endpoint in the list.
   */
  rotateEndpoint(): void {
    this._currentEndpoint = (this._currentEndpoint + 1) % this.endpoints.length;
  }

  /** Current active endpoint URL. */
  get url(): string {
    return this.currentUrl;
  }

  /** Number of configured endpoints. */
  get endpointCount(): number {
    return this.endpoints.length;
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Create a GhostRpcClient pre-configured for GhostChain L1.
 */
export function createGhostL1RpcClient(rpcUrl = "http://localhost:18545"): GhostRpcClient {
  return new GhostRpcClient({ url: rpcUrl });
}

/**
 * Create a GhostRpcClient pre-configured for GhostChain L2.
 */
export function createGhostL2RpcClient(rpcUrl = "http://localhost:29547"): GhostRpcClient {
  return new GhostRpcClient({ url: rpcUrl });
}

/**
 * Create a GhostRpcClient pre-configured for GhostChain L3.
 */
export function createGhostL3RpcClient(rpcUrl = "http://localhost:39545"): GhostRpcClient {
  return new GhostRpcClient({ url: rpcUrl });
}
