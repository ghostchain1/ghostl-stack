/**
 * GhostEventSystem — Chain event subscription for all GhostChain layers
 *
 * Provides a lightweight, polling-based event listener system
 * (no WebSocket dependency so it works with plain HTTP RPC).
 *
 * Usage:
 *   const events = new GhostEventSystem("http://localhost:29547");
 *
 *   // Subscribe to new blocks
 *   events.onBlock((block) => console.log("block", block.ghostNumber));
 *
 *   // Subscribe to contract logs
 *   events.onLog({ address: "0xABCD...", topics: ["0x..."] }, (log) => { ... });
 *
 *   // Start polling (default every 2 s)
 *   await events.start();
 *   // ... later:
 *   events.stop();
 */

import { GhostRPC, type GhostRpcBlock, type GhostRpcLog } from "../rpc/GhostRPC";
import {
  GhostNetworkRegistry,
  ChainLayer,
  type GhostNetwork,
} from "./GhostNetworkRegistry";

// ── Types ─────────────────────────────────────────────────────────────────────

export type BlockHandler = (block: GhostRpcBlock) => void | Promise<void>;
export type LogHandler   = (log: GhostRpcLog)     => void | Promise<void>;

export interface LogFilter {
  address?: string | string[];
  topics?:  (string | string[] | null)[];
  fromBlock?: number;
}

interface LogSubscription {
  filter:  LogFilter;
  handler: LogHandler;
}

// ── GhostEventSystem ──────────────────────────────────────────────────────────

export class GhostEventSystem {
  private rpc:    GhostRPC;
  private layer:  ChainLayer;

  private _running  = false;
  private _interval = 2000; // ms between polls
  private _timer:   ReturnType<typeof setTimeout> | null = null;
  private _lastBlock = -1;

  private _blockHandlers: BlockHandler[]     = [];
  private _logSubs:       LogSubscription[]   = [];
  private _errorHandlers: ((err: Error) => void)[] = [];

  constructor(rpcUrlOrNetwork: string | GhostNetwork, pollIntervalMs = 2000) {
    const url = typeof rpcUrlOrNetwork === "string"
      ? rpcUrlOrNetwork
      : rpcUrlOrNetwork.rpcUrl;
    this.rpc       = new GhostRPC(url);
    this.layer     = ChainLayer.L1; // default; overridden by factory methods
    this._interval = pollIntervalMs;
  }

  // ── Factories ─────────────────────────────────────────────────────────────

  static forL1(pollMs = 2000): GhostEventSystem {
    const sys = new GhostEventSystem(GhostNetworkRegistry.get(ChainLayer.L1), pollMs);
    sys.layer = ChainLayer.L1;
    return sys;
  }

  static forL2(pollMs = 2000): GhostEventSystem {
    const sys = new GhostEventSystem(GhostNetworkRegistry.get(ChainLayer.L2), pollMs);
    sys.layer = ChainLayer.L2;
    return sys;
  }

  static forL3(pollMs = 2000): GhostEventSystem {
    const sys = new GhostEventSystem(GhostNetworkRegistry.get(ChainLayer.L3), pollMs);
    sys.layer = ChainLayer.L3;
    return sys;
  }

  // ── Subscription API ──────────────────────────────────────────────────────

  /** Register a handler for every new block. */
  onBlock(handler: BlockHandler): this {
    this._blockHandlers.push(handler);
    return this;
  }

  /** Register a handler for contract logs matching the given filter. */
  onLog(filter: LogFilter, handler: LogHandler): this {
    this._logSubs.push({ filter, handler });
    return this;
  }

  /** Register an error handler called when polling fails. */
  onError(handler: (err: Error) => void): this {
    this._errorHandlers.push(handler);
    return this;
  }

  /** Remove all block handlers. */
  offBlock(): this {
    this._blockHandlers = [];
    return this;
  }

  /** Remove all log subscriptions. */
  offLog(): this {
    this._logSubs = [];
    return this;
  }

  // ── Lifecycle ─────────────────────────────────────────────────────────────

  /**
   * Start polling.  Sets `_lastBlock` to current tip if not already set,
   * then schedules recurring ticks.
   */
  async start(): Promise<void> {
    if (this._running) return;
    this._running = true;

    if (this._lastBlock < 0) {
      this._lastBlock = await this.rpc.ghost_blockNumber();
    }

    this._scheduleTick();
  }

  /** Stop polling and clear the timer. */
  stop(): void {
    this._running = false;
    if (this._timer !== null) {
      clearTimeout(this._timer);
      this._timer = null;
    }
  }

  get isRunning(): boolean {
    return this._running;
  }

  get layer1(): ChainLayer {
    return this.layer;
  }

  // ── Internal polling ──────────────────────────────────────────────────────

  private _scheduleTick(): void {
    if (!this._running) return;
    this._timer = setTimeout(async () => {
      await this._tick();
      this._scheduleTick();
    }, this._interval);
  }

  private async _tick(): Promise<void> {
    try {
      const latest = await this.rpc.ghost_blockNumber();
      if (latest <= this._lastBlock) return;

      for (let n = this._lastBlock + 1; n <= latest; n++) {
        await this._processBlock(n);
      }
      this._lastBlock = latest;
    } catch (err) {
      this._emitError(err instanceof Error ? err : new Error(String(err)));
    }
  }

  private async _processBlock(blockNumber: number): Promise<void> {
    // Fetch block data if there are block handlers
    if (this._blockHandlers.length > 0) {
      const block = await this.rpc.ghost_getBlockByNumber(blockNumber, false);
      if (block) {
        for (const h of this._blockHandlers) {
          try { await h(block); } catch (e) { this._emitError(e instanceof Error ? e : new Error(String(e))); }
        }
      }
    }

    // Fetch logs for each subscription
    for (const sub of this._logSubs) {
      try {
        const logs = await this.rpc.ghost_getLogs({
          fromBlock: blockNumber,
          toBlock:   blockNumber,
          ...(sub.filter.address ? { address: sub.filter.address } : {}),
          ...(sub.filter.topics  ? { topics:  sub.filter.topics }  : {}),
        });
        for (const log of logs) {
          try { await sub.handler(log); } catch (e) { this._emitError(e instanceof Error ? e : new Error(String(e))); }
        }
      } catch (e) {
        this._emitError(e instanceof Error ? e : new Error(String(e)));
      }
    }
  }

  private _emitError(err: Error): void {
    if (this._errorHandlers.length > 0) {
      for (const h of this._errorHandlers) { try { h(err); } catch { /**/ } }
    } else {
      console.error("[GhostEventSystem]", err.message);
    }
  }
}
