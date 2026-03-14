/**
 * GhostFinalityTracker
 *
 * Tracks transaction finality across GhostStack layers.
 * Each layer has different confirmation requirements based on its
 * security level within the derivation hierarchy.
 *
 * Default confirmation requirements:
 *   L1: 12 blocks (~2.4 min at 12s blocks) — settlement finality
 *   L2: 8 blocks  (~0.8 min at 2s blocks)  — rollup finality
 *   L3: 4 blocks  (~0.4 min at 600ms blocks) — app-chain finality
 */

import type { GhostLayer } from "../networks.js";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface FinalityConfig {
  /** Number of confirmation blocks per layer */
  confirmations?: Partial<Record<GhostLayer, number>>;
}

export interface FinalityStatus {
  txBlockNumber:    number;
  currentBlock:     number;
  confirmations:    number;
  required:         number;
  isFinal:          boolean;
  remainingBlocks:  number;
  layer:            GhostLayer;
}

// ── GhostFinalityTracker ──────────────────────────────────────────────────────

export class GhostFinalityTracker {
  private readonly confirmationsRequired: Record<GhostLayer, number>;

  constructor(config: FinalityConfig = {}) {
    this.confirmationsRequired = {
      L1: config.confirmations?.L1 ?? 12,
      L2: config.confirmations?.L2 ?? 8,
      L3: config.confirmations?.L3 ?? 4,
    };
  }

  /**
   * Check whether a transaction in `txBlock` has reached finality
   * given the `currentBlock` on the specified layer.
   */
  isFinal(txBlock: number, currentBlock: number, layer: GhostLayer = "L2"): boolean {
    return (currentBlock - txBlock) >= this.confirmationsRequired[layer];
  }

  /**
   * Return a detailed finality status object.
   */
  status(txBlock: number, currentBlock: number, layer: GhostLayer = "L2"): FinalityStatus {
    const required       = this.confirmationsRequired[layer];
    const confirmations  = Math.max(0, currentBlock - txBlock);
    const isFinal        = confirmations >= required;
    const remainingBlocks = Math.max(0, required - confirmations);

    return { txBlockNumber: txBlock, currentBlock, confirmations, required, isFinal, remainingBlocks, layer };
  }

  /**
   * How many blocks until finality from current tip.
   */
  blocksUntilFinal(txBlock: number, currentBlock: number, layer: GhostLayer = "L2"): number {
    return Math.max(0, this.confirmationsRequired[layer] - (currentBlock - txBlock));
  }

  /** Get the configured confirmation requirement for a layer. */
  requiredConfirmations(layer: GhostLayer): number {
    return this.confirmationsRequired[layer];
  }
}
