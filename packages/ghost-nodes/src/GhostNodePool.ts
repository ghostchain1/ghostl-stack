/**
 * @file GhostNodePool.ts
 * @module @ghostchain/ghost-nodes
 *
 * GhostNodePool — multi-node connection pool with failover.
 *
 * Manages a pool of GhostNode instances, selects the healthiest node
 * for each RPC call, and automatically evicts failed nodes.
 */

import { GhostNode, GhostNodeFactory, GHOST_FLEET } from "./GhostNode.js";
import { GhostNodeLayer, GhostNodeRole, GhostNodeStatus, GhostNodePoolConfig } from "./types.js";
import { GhostRPCClient } from "./rpc/GhostRPCClient.js";

// ─── Selection strategy ───────────────────────────────────────────────────────

export type SelectionStrategy = "round-robin" | "random" | "lowest-latency" | "primary-first";

// ─── GhostNodePool ────────────────────────────────────────────────────────────

/**
 * GhostNodePool manages multiple GhostNode instances for a given layer.
 *
 * Selection strategies:
 * - `round-robin`      — cycle through healthy nodes in order
 * - `random`           — select a random healthy node
 * - `lowest-latency`   — prefer the node with the lowest measured latency
 * - `primary-first`    — always try the first configured node, fallback on failure
 */
export class GhostNodePool {
  private readonly _nodes: GhostNode[];
  private readonly _clients: Map<string, GhostRPCClient> = new Map();
  private readonly _strategy: SelectionStrategy;
  private readonly _maxFailures: number;
  private readonly _healthIntervalMs: number;
  private _rrCursor = 0;
  private _healthTimer: ReturnType<typeof setInterval> | null = null;

  constructor(nodes: GhostNode[], config: Partial<GhostNodePoolConfig> = {}) {
    if (!nodes.length) throw new Error("GhostNodePool: must provide at least one node");
    this._nodes           = [...nodes];
    this._strategy        = (config.strategy as SelectionStrategy) ?? "round-robin";
    this._maxFailures     = config.maxConsecutiveFailures ?? 5;
    this._healthIntervalMs = config.healthCheckIntervalMs ?? 30_000;

    for (const node of this._nodes) {
      this._clients.set(node.rpcUrl, new GhostRPCClient(node.rpcUrl, node.config.fallbackRpcUrls ?? []));
    }
  }

  // ─── Factory helpers ──────────────────────────────────────────────────────

  /** Create a pool from all mainnet fleet nodes for a specific layer. */
  static mainnet(layer: GhostNodeLayer, config?: Partial<GhostNodePoolConfig>): GhostNodePool {
    const nodes = GhostNodeFactory.mainnet(layer);
    if (!nodes.length) throw new Error(`GhostNodePool: no mainnet nodes configured for layer ${layer}`);
    return new GhostNodePool(nodes, config);
  }

  /** Create a pool from all testnet fleet nodes for a specific layer. */
  static testnet(layer: GhostNodeLayer, config?: Partial<GhostNodePoolConfig>): GhostNodePool {
    const nodes = GhostNodeFactory.testnet(layer);
    if (!nodes.length) throw new Error(`GhostNodePool: no testnet nodes configured for layer ${layer}`);
    return new GhostNodePool(nodes, config);
  }

  /** Create a pool from the full Ghost fleet across all layers. */
  static fullFleet(config?: Partial<GhostNodePoolConfig>): GhostNodePool {
    const nodes = GhostNodeFactory.fromFleet();
    return new GhostNodePool(nodes, config);
  }

  // ─── Node selection ───────────────────────────────────────────────────────

  /** Returns the currently selected node based on strategy. */
  select(): GhostNode {
    const healthy = this._healthyNodes();
    if (!healthy.length) throw new Error("GhostNodePool: no healthy nodes available");

    switch (this._strategy) {
      case "round-robin":
        this._rrCursor = this._rrCursor % healthy.length;
        return healthy[this._rrCursor++ % healthy.length];

      case "random":
        return healthy[Math.floor(Math.random() * healthy.length)];

      case "lowest-latency":
        return healthy.reduce((best, node) => {
          const bestLatency = best.health.latencyMs ?? Infinity;
          const nodeLatency = node.health.latencyMs ?? Infinity;
          return nodeLatency < bestLatency ? node : best;
        });

      case "primary-first":
        return healthy[0];

      default:
        return healthy[0];
    }
  }

  /** Returns the RPC client for the selected node. */
  client(): GhostRPCClient {
    const node   = this.select();
    const rpc    = this._clients.get(node.rpcUrl);
    if (!rpc) throw new Error(`GhostNodePool: no client found for ${node.rpcUrl}`);
    return rpc;
  }

  // ─── Health management ────────────────────────────────────────────────────

  /** Start background health polling for all nodes in the pool. */
  startHealthPolling(): void {
    if (this._healthTimer) return;
    this._healthTimer = setInterval(async () => {
      for (const node of this._nodes) {
        await node.checkHealth().catch(() => {});
      }
    }, this._healthIntervalMs);
  }

  /** Stop background health polling. */
  stopHealthPolling(): void {
    if (this._healthTimer) {
      clearInterval(this._healthTimer);
      this._healthTimer = null;
    }
  }

  /** Returns all nodes (healthy or not). */
  get nodes(): readonly GhostNode[] {
    return this._nodes;
  }

  /** Returns only healthy/degraded nodes. */
  healthyNodes(): readonly GhostNode[] {
    return this._healthyNodes();
  }

  /** Returns count of currently healthy nodes. */
  get healthyCount(): number {
    return this._healthyNodes().length;
  }

  /** Returns count of unreachable nodes. */
  get downCount(): number {
    return this._nodes.filter((n) => n.health.status === GhostNodeStatus.Unreachable).length;
  }

  // ─── Convenience RPC wrappers ─────────────────────────────────────────────

  /**
   * Execute a Ghost-branded JSON-RPC call across the pool.
   * Automatically retries on other nodes if one fails.
   */
  async call<T>(ghostMethod: string, params: unknown[]): Promise<T> {
    const healthy = this._healthyNodes();
    let lastErr: Error | undefined;

    for (const node of healthy) {
      const rpc = this._clients.get(node.rpcUrl)!;
      try {
        return await rpc.call<T>(ghostMethod, params);
      } catch (err) {
        lastErr = err instanceof Error ? err : new Error(String(err));
      }
    }

    throw lastErr ?? new Error("GhostNodePool: all nodes failed");
  }

  // ─── Private ──────────────────────────────────────────────────────────────

  private _healthyNodes(): GhostNode[] {
    return this._nodes.filter(
      (n) => n.health.status !== GhostNodeStatus.Unreachable
    );
  }
}
