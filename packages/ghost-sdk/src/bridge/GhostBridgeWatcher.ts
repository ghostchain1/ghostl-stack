/**
 * GhostBridgeWatcher
 *
 * Polls the chain until a bridge transaction reaches finality,
 * then resolves with the confirmed receipt.
 *
 * Works with GhostFinalityTracker to determine the confirmation
 * threshold appropriate for each GhostStack layer.
 *
 * Usage:
 *   const watcher = new GhostBridgeWatcher(provider, "L2");
 *   const status  = await watcher.watch("0xtxhash...", txBlockNumber);
 */

import type { GhostLayer } from "../networks.js";
import { GhostFinalityTracker, type FinalityStatus } from "./GhostFinalityTracker.js";
import type { GhostNativeProvider } from "../native/GhostNativeProvider.js";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface BridgeWatchResult {
  txHash:       string;
  txBlock:      number;
  finalBlock:   number;
  confirmations: number;
  layer:        GhostLayer;
  elapsedMs:    number;
}

export type BridgeWatchProgressCallback = (status: FinalityStatus) => void;

export interface BridgeWatcherConfig {
  /** Polling interval in milliseconds. Default: 3000 */
  pollIntervalMs?: number;
  /** Maximum polling duration in milliseconds. Default: 300_000 (5 min) */
  timeoutMs?: number;
  /** Custom confirmation counts per layer */
  confirmations?: Partial<Record<GhostLayer, number>>;
}

// ── GhostBridgeWatcher ────────────────────────────────────────────────────────

export class GhostBridgeWatcher {
  private readonly provider:        GhostNativeProvider;
  private readonly layer:           GhostLayer;
  private readonly finality:        GhostFinalityTracker;
  private readonly pollIntervalMs:  number;
  private readonly timeoutMs:       number;

  constructor(
    provider: GhostNativeProvider,
    layer: GhostLayer = "L2",
    config: BridgeWatcherConfig = {}
  ) {
    this.provider       = provider;
    this.layer          = layer;
    this.finality       = new GhostFinalityTracker({ confirmations: config.confirmations });
    this.pollIntervalMs = config.pollIntervalMs ?? 3_000;
    this.timeoutMs      = config.timeoutMs      ?? 300_000;
  }

  /**
   * Watch a transaction until it reaches finality on the target layer.
   *
   * @param txHash         The transaction hash to watch.
   * @param txBlockNumber  The block number the tx was included in.
   * @param onProgress     Optional callback fired on each polling tick.
   * @returns              Resolved `BridgeWatchResult` when final.
   */
  async watch(
    txHash: string,
    txBlockNumber: number,
    onProgress?: BridgeWatchProgressCallback
  ): Promise<BridgeWatchResult> {
    const started = Date.now();

    while (true) {
      const elapsed = Date.now() - started;
      if (elapsed > this.timeoutMs) {
        throw new Error(
          `GhostBridgeWatcher: timeout after ${(elapsed / 1000).toFixed(0)}s ` +
          `waiting for ${txHash} to reach finality on ${this.layer}`
        );
      }

      const currentBlock = await this.provider.getBlockNumber();
      const status       = this.finality.status(txBlockNumber, currentBlock, this.layer);

      onProgress?.(status);

      if (status.isFinal) {
        return {
          txHash,
          txBlock:       txBlockNumber,
          finalBlock:    currentBlock,
          confirmations: status.confirmations,
          layer:         this.layer,
          elapsedMs:     Date.now() - started,
        };
      }

      await this._sleep(this.pollIntervalMs);
    }
  }

  /**
   * Quick finality check without polling — just checks current block number.
   */
  async checkOnce(txBlockNumber: number): Promise<FinalityStatus> {
    const currentBlock = await this.provider.getBlockNumber();
    return this.finality.status(txBlockNumber, currentBlock, this.layer);
  }

  private _sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
