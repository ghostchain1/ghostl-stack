/**
 * LogWatcher — polls eth_getLogs and calls registered callbacks for new events.
 */

import type { HttpProvider } from "../providers/HttpProvider.js";
import type { GhostLogFilter as NativeLogFilter, GhostBlockTag } from "../native/types.js";

export interface LogFilter {
  address?: `0x${string}` | `0x${string}`[];
  topics?: ((`0x${string}` | null) | (`0x${string}` | null)[])[];
}

export interface RawLog {
  address: `0x${string}`;
  topics: `0x${string}`[];
  data: `0x${string}`;
  blockNumber: `0x${string}`;
  transactionHash: `0x${string}`;
  logIndex: `0x${string}`;
  blockHash: `0x${string}`;
  transactionIndex: `0x${string}`;
  removed: boolean;
}

export type LogCallback = (log: RawLog) => void | Promise<void>;

export interface LogWatcherOptions {
  /** Polling interval in ms (default: 4_000) */
  pollMs?: number;
  /** Starting block (default: "latest" − resolved at start time) */
  fromBlock?: bigint | "latest";
}

export class LogWatcher {
  private readonly provider: HttpProvider;
  private readonly filter: LogFilter;
  private readonly pollMs: number;
  private readonly fromBlockInit: bigint | "latest";

  private callbacks: LogCallback[] = [];
  private _running = false;
  private _timer?: ReturnType<typeof setTimeout>;
  private _lastBlock: bigint | null = null;
  private _seenLogs = new Set<string>();

  constructor(
    provider: HttpProvider,
    filter: LogFilter,
    opts: LogWatcherOptions = {},
  ) {
    this.provider = provider;
    this.filter = filter;
    this.pollMs = opts.pollMs ?? 4_000;
    this.fromBlockInit = opts.fromBlock ?? "latest";
  }

  /** Register a callback for new matching logs. */
  on(cb: LogCallback): this {
    this.callbacks.push(cb);
    return this;
  }

  /** Remove a callback. */
  off(cb: LogCallback): this {
    this.callbacks = this.callbacks.filter((c) => c !== cb);
    return this;
  }

  /** Start polling. */
  start(): this {
    if (this._running) return this;
    this._running = true;
    void this._poll(true);
    return this;
  }

  /** Stop polling. */
  stop(): this {
    this._running = false;
    if (this._timer) {
      clearTimeout(this._timer);
      this._timer = undefined;
    }
    return this;
  }

  get isRunning(): boolean {
    return this._running;
  }

  // ── Internal ──────────────────────────────────────────────────────────────

  private async _poll(init = false): Promise<void> {
    if (!this._running) return;

    try {
      const latestBlock = await this.provider.getBlockNumber();

      if (init || this._lastBlock === null) {
        if (this.fromBlockInit === "latest") {
          this._lastBlock = latestBlock;
        } else {
          this._lastBlock = this.fromBlockInit;
        }
      }

      if (latestBlock >= this._lastBlock) {
        const rawFilter: NativeLogFilter = {
          fromBlock: `0x${this._lastBlock.toString(16)}` as GhostBlockTag,
          toBlock: `0x${latestBlock.toString(16)}` as GhostBlockTag,
        };

        if (this.filter.address) rawFilter.address = this.filter.address as NativeLogFilter["address"];
        if (this.filter.topics) rawFilter.topics = this.filter.topics as NativeLogFilter["topics"];

        const logs = (await this.provider.getLogs(rawFilter)) as RawLog[];

        for (const log of logs) {
          const logId = `${log.transactionHash}:${log.logIndex}`;
          if (this._seenLogs.has(logId)) continue;
          this._seenLogs.add(logId);

          for (const cb of this.callbacks) {
            try {
              await cb(log);
            } catch {
              // swallow callback errors
            }
          }
        }

        // Trim seen set to avoid unbounded growth
        if (this._seenLogs.size > 10_000) {
          const entries = Array.from(this._seenLogs);
          this._seenLogs = new Set(entries.slice(entries.length - 5_000));
        }

        this._lastBlock = latestBlock + 1n;
      }
    } catch {
      // swallow poll errors
    }

    if (this._running) {
      this._timer = setTimeout(() => void this._poll(), this.pollMs);
    }
  }
}
