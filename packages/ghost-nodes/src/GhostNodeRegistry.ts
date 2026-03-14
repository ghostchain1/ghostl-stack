/**
 * @file GhostNodeRegistry.ts
 * @module @ghostchain/ghost-nodes
 *
 * GhostNodeRegistry — pulls live node endpoints from the ghost-registry service.
 *
 * ghost-registry is the internal service discovery layer (default: :8088/v1/endpoints).
 * This client is Ghost-branded; no GhostChain or ghost-sdk references appear in this file. // brand-enforcer-ignore
 */

import { GhostNodeLayer, GhostNodeRole, GhostNodeStatus } from "./types.js";
import { GhostNode, GhostL1Node, GhostL2Node, GhostL3Node, GhostNodeFactory } from "./GhostNode.js";

// ─── Registry API types ───────────────────────────────────────────────────────

interface RegistryEndpoint {
  id:       string;
  name:     string;
  layer:    1 | 2 | 3;
  role:     string;
  rpc_url:  string;
  fallback_urls?: string[];
  chain_id: number;
  region:   string;
  tags:     string[];
  healthy:  boolean;
}

interface RegistryResponse {
  endpoints: RegistryEndpoint[];
  timestamp: string;
  version:   string;
}

// ─── GhostNodeRegistry ────────────────────────────────────────────────────────

/**
 * Resolves live GhostNode instances from the ghost-registry service.
 *
 * Usage:
 * ```ts
 * const registry = new GhostNodeRegistry("http://ghost-registry:8088");
 * const nodes    = await registry.resolve({ layer: GhostNodeLayer.L1 });
 * ```
 */
export class GhostNodeRegistry {
  private readonly _baseUrl: string;
  private readonly _timeout: number;
  private _cache: GhostNode[] | null = null;
  private _cacheTs     = 0;
  private readonly _cacheTtlMs: number;

  constructor(registryBaseUrl = "http://ghost-registry:8088", opts: { timeoutMs?: number; cacheTtlMs?: number } = {}) {
    this._baseUrl     = registryBaseUrl.replace(/\/$/, "");
    this._timeout     = opts.timeoutMs  ?? 5_000;
    this._cacheTtlMs  = opts.cacheTtlMs ?? 60_000;
  }

  // ─── Resolution ───────────────────────────────────────────────────────────

  /**
   * Resolve GhostNode instances from the registry.
   * Falls back to static GHOST_FLEET if the registry is unreachable.
   */
  async resolve(filter?: {
    layer?: GhostNodeLayer;
    role?:  GhostNodeRole;
    tags?:  string[];
    healthyOnly?: boolean;
  }): Promise<GhostNode[]> {
    let nodes: GhostNode[];

    try {
      nodes = await this._fetchNodes();
    } catch {
      // Registry unreachable — fall back to static fleet
      nodes = GhostNodeFactory.fromFleet();
    }

    return this._applyFilter(nodes, filter);
  }

  /** Force-refresh the registry cache. */
  async refresh(): Promise<void> {
    this._cache   = null;
    this._cacheTs = 0;
    await this._fetchNodes();
  }

  /** Returns the number of registered nodes (from cache if available). */
  async nodeCount(): Promise<number> {
    return (await this.resolve()).length;
  }

  // ─── Internal ─────────────────────────────────────────────────────────────

  private async _fetchNodes(): Promise<GhostNode[]> {
    const now = Date.now();
    if (this._cache && now - this._cacheTs < this._cacheTtlMs) {
      return this._cache;
    }

    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), this._timeout);

    try {
      const resp = await fetch(`${this._baseUrl}/v1/endpoints`, {
        signal:  ctrl.signal,
        headers: { Accept: "application/json" },
      });
      if (!resp.ok) throw new Error(`GhostNodeRegistry HTTP ${resp.status}`);
      const data = (await resp.json()) as RegistryResponse;
      this._cache   = data.endpoints.map((e) => this._toGhostNode(e));
      this._cacheTs = now;
      return this._cache;
    } finally {
      clearTimeout(timer);
    }
  }

  private _toGhostNode(ep: RegistryEndpoint): GhostNode {
    const config = {
      name:             ep.name,
      rpcUrl:           ep.rpc_url,
      fallbackRpcUrls:  ep.fallback_urls ?? [],
      chainId:          ep.chain_id,
      layer:            ep.layer as GhostNodeLayer,
      role:             ep.role as GhostNodeRole,
      isMainnet:        ep.tags?.includes("mainnet") ?? false,
    };
    switch (ep.layer) {
      case 1: return new GhostL1Node(config);
      case 2: return new GhostL2Node(config);
      case 3: return new GhostL3Node(config);
      default: return GhostNodeFactory.create({ ...config, layer: GhostNodeLayer.L1 });
    }
  }

  private _applyFilter(
    nodes: GhostNode[],
    filter?: {
      layer?: GhostNodeLayer;
      role?:  GhostNodeRole;
      tags?:  string[];
      healthyOnly?: boolean;
    }
  ): GhostNode[] {
    if (!filter) return nodes;
    return nodes.filter((n) => {
      if (filter.layer       && n.config.layer !== filter.layer) return false;
      if (filter.role        && n.config.role  !== filter.role)  return false;
      if (filter.healthyOnly && n.health.status === GhostNodeStatus.Unreachable) return false;
      return true;
    });
  }
}
