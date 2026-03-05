/**
 * GhostEventSubscriber
 *
 * Typed, filterable RPC-event subscriber built on GhostEvents.
 * Polls chain RPC endpoints for new blocks, filtered logs, and
 * pending transactions, then emits into the GhostStack event bus.
 *
 * Usage:
 *   const sub = new GhostEventSubscriber({
 *     layer: "L2",
 *     onBlock: (block) => console.log(block),
 *   });
 *   sub.start();
 *   // later:
 *   sub.stop();
 */

import { GhostNetworks } from "../networks.js";
import type { GhostLayer } from "../networks.js";
import { GhostEvents, GhostEventSubscription } from "./GhostEvents.js";

// ── Types ──────────────────────────────────────────────────────────────────────

export interface GhostBlockEvent {
  layer:       GhostLayer;
  blockNumber: bigint;
  blockHash:   string;
  timestamp:   number;
  gasUsed:     bigint;
  baseFeePerGas: bigint | null;
}

export interface GhostLogEvent {
  layer:       GhostLayer;
  blockNumber: bigint;
  txHash:      string;
  address:     string;
  topics:      string[];
  data:        string;
}

export interface GhostLogFilter {
  /** Contract address to filter logs for */
  address?: string;
  /** Topics (array of topic or null for wildcard at that position) */
  topics?:  (string | null)[];
}

export interface GhostEventSubscriberConfig {
  /** Which layer to subscribe to */
  layer:             GhostLayer;
  /** Override RPC URL */
  rpc?:              string;
  /** Custom event bus to emit into. Default: internal instance */
  bus?:              GhostEvents;
  /** Block polling interval in ms. Default: 3000 */
  pollIntervalMs?:   number;
  /** Block callback */
  onBlock?:          (event: GhostBlockEvent) => void;
  /** Log callback (requires logFilter) */
  onLog?:            (event: GhostLogEvent) => void;
  /** Log filter for `onLog` */
  logFilter?:        GhostLogFilter;
}

// ── GhostEventSubscriber ───────────────────────────────────────────────────────

export class GhostEventSubscriber {
  readonly bus:    GhostEvents;
  private readonly layer:   GhostLayer;
  private readonly rpcUrl:  string;
  private readonly pollMs:  number;
  private readonly filter:  GhostLogFilter | null;

  private _timer:       ReturnType<typeof setTimeout> | null = null;
  private _lastBlock:   bigint = 0n;
  private _subs:        GhostEventSubscription[] = [];

  constructor(config: GhostEventSubscriberConfig) {
    this.layer  = config.layer;
    this.rpcUrl = config.rpc ?? GhostNetworks[config.layer].rpc;
    this.pollMs = config.pollIntervalMs ?? 3_000;
    this.bus    = config.bus ?? new GhostEvents();
    this.filter = config.logFilter ?? null;

    if (config.onBlock) {
      this._subs.push(this.bus.on<GhostBlockEvent>("block:new", config.onBlock));
    }
    if (config.onLog) {
      this._subs.push(this.bus.on<GhostLogEvent>("log:new", config.onLog));
    }
  }

  /** Start polling. */
  start(): void {
    if (this._timer) return;
    void this._tick();
  }

  /** Stop polling and release all listeners. */
  stop(): void {
    if (this._timer) { clearTimeout(this._timer); this._timer = null; }
    for (const sub of this._subs) sub.off();
    this._subs = [];
  }

  /** Wait for the next block, resolving once. */
  nextBlock(): Promise<GhostBlockEvent> {
    return new Promise((resolve) => {
      const sub = this.bus.once<GhostBlockEvent>("block:new", (evt) => {
        sub.off();
        resolve(evt);
      });
    });
  }

  // ── Internals ────────────────────────────────────────────────────────────────

  private async _tick(): Promise<void> {
    try {
      const latest = await this._getBlockNumber();
      if (latest > this._lastBlock) {
        await this._processRange(this._lastBlock, latest);
        this._lastBlock = latest;
      }
    } catch { /* Silently continue — RPC may be offline */ }

    this._timer = setTimeout(() => void this._tick(), this.pollMs);
  }

  private async _processRange(from: bigint, to: bigint): Promise<void> {
    // Emit block events for each new block (cap at 10 to avoid bursts on reconnect)
    const cap   = 10n;
    const start = from === 0n ? to : (to - from > cap ? to - cap : from + 1n);

    for (let n = start; n <= to; n++) {
      const block = await this._getBlock(n);
      if (block) {
        this.bus.emit<GhostBlockEvent>("block:new", block);
      }
    }

    // Emit logs if filter present
    if (this.filter && from > 0n) {
      const logs = await this._getLogs(from + 1n, to, this.filter);
      for (const log of logs) {
        this.bus.emit<GhostLogEvent>("log:new", log);
      }
    }
  }

  private async _getBlockNumber(): Promise<bigint> {
    const res = await this._rpc("eth_blockNumber", []);
    return BigInt(res as string);
  }

  private async _getBlock(number: bigint): Promise<GhostBlockEvent | null> {
    const res = await this._rpc("eth_getBlockByNumber", [`0x${number.toString(16)}`, false]) as Record<string, string> | null;
    if (!res) return null;
    return {
      layer:          this.layer,
      blockNumber:    BigInt(res["number"] ?? "0x0"),
      blockHash:      res["hash"] ?? "0x",
      timestamp:      Number(BigInt(res["timestamp"] ?? "0x0")),
      gasUsed:        BigInt(res["gasUsed"] ?? "0x0"),
      baseFeePerGas:  res["baseFeePerGas"] ? BigInt(res["baseFeePerGas"]) : null,
    };
  }

  private async _getLogs(from: bigint, to: bigint, filter: GhostLogFilter): Promise<GhostLogEvent[]> {
    const params: Record<string, unknown> = {
      fromBlock: `0x${from.toString(16)}`,
      toBlock:   `0x${to.toString(16)}`,
    };
    if (filter.address) params["address"] = filter.address;
    if (filter.topics)  params["topics"]  = filter.topics;

    const res = await this._rpc("eth_getLogs", [params]) as Array<Record<string, unknown>>;
    if (!Array.isArray(res)) return [];
    return res.map((l) => ({
      layer:       this.layer,
      blockNumber: BigInt((l["blockNumber"] as string) ?? "0x0"),
      txHash:      (l["transactionHash"] as string) ?? "0x",
      address:     (l["address"] as string) ?? "0x",
      topics:      (l["topics"] as string[]) ?? [],
      data:        (l["data"] as string) ?? "0x",
    }));
  }

  private async _rpc(method: string, params: unknown[]): Promise<unknown> {
    const res = await fetch(this.rpcUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
    });
    const json = await res.json() as { result?: unknown; error?: unknown };
    if (json.error) throw new Error(JSON.stringify(json.error));
    return json.result;
  }
}
