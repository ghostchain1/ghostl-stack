/**
 * GhostRpcController — RPC endpoint load balancer for GhostStack nodes.
 *
 * Wraps multiple RPC URLs per layer into a round-robin pool with optional
 * health-aware selection.  Integrates with GhostHealthMonitor to skip
 * endpoints that are known to be down.
 *
 * Canonical chain IDs and default RPC ports:
 *   L1 — GhostChain  (chainId 14000101, port 18545)
 *   L2 — GhostL2     (chainId 901,      port 29547)
 *   L3 — GhostL3     (chainId 903,      port 39545)
 *
 * Usage:
 *   const ctrl = new GhostRpcController({
 *     L1: ["http://localhost:18545", "http://validator2:18545"],
 *     L2: ["http://localhost:29547"],
 *     L3: ["http://localhost:39545", "http://validator2:39545"],
 *   });
 *
 *   const rpcUrl = ctrl.pick("L3");   // round-robin URL for L3
 *   const allL3  = ctrl.list("L3");   // all registered L3 URLs
 */

import type { GhostLayer } from "../networks.js";
import { GhostNetworks }   from "../networks.js";

// ── Types ──────────────────────────────────────────────────────────────────────

export type RpcPoolConfig = Partial<Record<GhostLayer, string[]>>;

export interface RpcEndpointStatus {
  url:    string;
  layer:  GhostLayer;
  /** Whether this endpoint is currently considered healthy. */
  healthy: boolean;
}

// ── GhostRpcController ────────────────────────────────────────────────────────

export class GhostRpcController {
  private readonly _pools:    Map<GhostLayer, string[]>;
  private readonly _counters: Map<GhostLayer, number>;
  private readonly _unhealthy: Set<string>;

  constructor(config: RpcPoolConfig = {}) {
    const defaults: Record<GhostLayer, string[]> = {
      L1: [GhostNetworks.L1.rpc],
      L2: [GhostNetworks.L2.rpc],
      L3: [GhostNetworks.L3.rpc],
    };

    this._pools    = new Map();
    this._counters = new Map();
    this._unhealthy = new Set();

    for (const layer of ["L1", "L2", "L3"] as GhostLayer[]) {
      const urls = config[layer] ?? defaults[layer];
      if (urls.length === 0) throw new Error(`GhostRpcController: no RPC URLs provided for ${layer}`);
      this._pools.set(layer, [...urls]);
      this._counters.set(layer, 0);
    }
  }

  // ── Selection ──────────────────────────────────────────────────────────────────

  /**
   * Pick the next healthy RPC URL for the given layer using round-robin.
   * If all endpoints are marked unhealthy, returns the next in rotation
   * anyway (fail-open) to let the caller surface the error.
   */
  pick(layer: GhostLayer): string {
    const pool = this._pool(layer);
    const healthy = pool.filter(u => !this._unhealthy.has(u));
    const candidates = healthy.length > 0 ? healthy : pool;

    const counter = this._counters.get(layer) ?? 0;
    const url = candidates[counter % candidates.length];
    this._counters.set(layer, counter + 1);
    return url;
  }

  /** Return all registered URLs for a layer. */
  list(layer: GhostLayer): string[] {
    return [...this._pool(layer)];
  }

  /** Return status of every registered endpoint. */
  status(): RpcEndpointStatus[] {
    const out: RpcEndpointStatus[] = [];
    for (const [layer, urls] of this._pools) {
      for (const url of urls) {
        out.push({ url, layer, healthy: !this._unhealthy.has(url) });
      }
    }
    return out;
  }

  // ── Health management ──────────────────────────────────────────────────────────

  /** Mark an endpoint as unhealthy (excluded from preferred picks). */
  markUnhealthy(url: string): void {
    this._unhealthy.add(url);
  }

  /** Mark an endpoint as healthy again. */
  markHealthy(url: string): void {
    this._unhealthy.delete(url);
  }

  /**
   * Probe all endpoints with a lightweight `ghost_blockNumber` call and
   * automatically update health markers.
   */
  async probeAll(timeoutMs = 4_000): Promise<RpcEndpointStatus[]> {
    const results: RpcEndpointStatus[] = [];

    for (const [layer, urls] of this._pools) {
      for (const url of urls) {
        const healthy = await this._probe(url, timeoutMs);
        if (healthy) this.markHealthy(url);
        else          this.markUnhealthy(url);
        results.push({ url, layer, healthy });
      }
    }

    return results;
  }

  // ── Registration ──────────────────────────────────────────────────────────────

  /** Add a new RPC URL to a layer's pool (no-op if already registered). */
  addEndpoint(layer: GhostLayer, url: string): void {
    const pool = this._pool(layer);
    if (!pool.includes(url)) pool.push(url);
  }

  /** Remove an endpoint from a layer's pool. */
  removeEndpoint(layer: GhostLayer, url: string): boolean {
    const pool = this._pool(layer);
    const idx  = pool.indexOf(url);
    if (idx < 0) return false;
    pool.splice(idx, 1);
    this._unhealthy.delete(url);
    return true;
  }

  // ── Internals ─────────────────────────────────────────────────────────────────

  private _pool(layer: GhostLayer): string[] {
    const pool = this._pools.get(layer);
    if (!pool) throw new Error(`GhostRpcController: unknown layer "${layer}"`);
    return pool;
  }

  private async _probe(url: string, timeoutMs: number): Promise<boolean> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "ghost_blockNumber", params: [] }),
        signal: controller.signal,
      });
      const data = await res.json() as { result?: unknown };
      return typeof data.result === "string";
    } catch {
      return false;
    } finally {
      clearTimeout(timer);
    }
  }
}
