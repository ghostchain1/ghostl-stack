/**
 * BlockWatcher — polls for new blocks and calls registered callbacks.
 */

import type { HttpProvider, HttpProviderBlock } from "../providers/HttpProvider.js";

export type BlockCallback = (block: HttpProviderBlock) => void | Promise<void>;

export interface BlockWatcherOptions {
  /** Polling interval in ms (default: 4_000) */
  pollMs?: number;
  /** Whether to emit the current block immediately on start (default: false) */
  emitOnStart?: boolean;
}

export class BlockWatcher {
  private readonly provider: HttpProvider;
  private readonly pollMs: number;
  private readonly emitOnStart: boolean;

  private callbacks: BlockCallback[] = [];
  private _running = false;
  private _timer?: ReturnType<typeof setTimeout>;
  private _lastBlock = -1n;

  constructor(provider: HttpProvider, opts: BlockWatcherOptions = {}) {
    this.provider = provider;
    this.pollMs = opts.pollMs ?? 4_000;
    this.emitOnStart = opts.emitOnStart ?? false;
  }

  /** Register a callback to be called on every new block. */
  on(cb: BlockCallback): this {
    this.callbacks.push(cb);
    return this;
  }

  /** Remove a callback. */
  off(cb: BlockCallback): this {
    this.callbacks = this.callbacks.filter((c) => c !== cb);
    return this;
  }

  /** Start polling. */
  start(): this {
    if (this._running) return this;
    this._running = true;
    void this._poll(this.emitOnStart);
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

  private async _poll(emitCurrentBlock = false): Promise<void> {
    if (!this._running) return;

    try {
      const blockNumber = await this.provider.getBlockNumber();

      if (emitCurrentBlock && this._lastBlock === -1n) {
        this._lastBlock = blockNumber - 1n;
      }

      if (blockNumber > this._lastBlock) {
        // Emit all new blocks in order
        for (let n = this._lastBlock + 1n; n <= blockNumber; n++) {
          if (!this._running) break;
          try {
            const block = await this.provider.getBlock(`0x${n.toString(16)}` as import("../native/types.js").GhostBlockTag);
            if (block) {
              for (const cb of this.callbacks) {
                try {
                  await cb(block);
                } catch {
                  // swallow callback errors
                }
              }
            }
          } catch {
            // swallow per-block errors; try again next poll
          }
        }
        this._lastBlock = blockNumber;
      }
    } catch {
      // swallow poll errors
    }

    if (this._running) {
      this._timer = setTimeout(() => void this._poll(), this.pollMs);
    }
  }
}
