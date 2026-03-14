/**
 * GhostBatchTx — sequential batch transaction executor.
 *
 * Aggregates multiple GhostTxRequest objects and executes them in order
 * through a GhostNativeWallet (or any signer that exposes sendTransaction).
 *
 * Usage:
 *   const batch = new GhostBatchTx();
 *   batch.add(GhostTxBuilder.transfer("0xabc", parseGhost("1")).layer("L3").build());
 *   batch.add(GhostTxBuilder.call("0xdeadbeef...").to("0xcontract").layer("L3").build());
 *   const receipts = await batch.execute(wallet);
 */

import type { GhostTxRequest, Hex } from "../native/types.js";

// ── Types ──────────────────────────────────────────────────────────────────────

/** Minimal signer interface required by GhostBatchTx */
export interface BatchSigner {
  sendTransaction(tx: GhostTxRequest): Promise<Hex>;
}

export interface BatchResult {
  index: number;
  txHash: Hex;
  /** Error message if this particular tx failed; undefined on success */
  error?: string;
}

export interface BatchOptions {
  /**
   * If false (default) the batch stops immediately when any tx fails.
   * If true all txs are attempted and errors collected in `results`.
   */
  continueOnError?: boolean;
}

// ── GhostBatchTx ──────────────────────────────────────────────────────────────

export class GhostBatchTx {
  private readonly txs: GhostTxRequest[] = [];

  /** Add a transaction to the batch queue. */
  add(tx: GhostTxRequest): this {
    this.txs.push(tx);
    return this;
  }

  /** Replace the entire queue with the supplied transactions. */
  set(txs: GhostTxRequest[]): this {
    this.txs.splice(0, this.txs.length, ...txs);
    return this;
  }

  /** Return a snapshot of the current queue. */
  pending(): ReadonlyArray<GhostTxRequest> {
    return this.txs;
  }

  /** Clear the queue without executing. */
  clear(): this {
    this.txs.splice(0, this.txs.length);
    return this;
  }

  /**
   * Execute all queued transactions sequentially.
   *
   * @throws {Error} If `continueOnError` is false (default) and any tx fails.
   * @returns Array of `BatchResult` objects — one per queued tx.
   */
  async execute(
    signer: BatchSigner,
    options: BatchOptions = {},
  ): Promise<BatchResult[]> {
    const { continueOnError = false } = options;
    const results: BatchResult[] = [];

    for (let i = 0; i < this.txs.length; i++) {
      try {
        const txHash = await signer.sendTransaction(this.txs[i]);
        results.push({ index: i, txHash });
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        if (!continueOnError) {
          throw new Error(
            `GhostBatchTx: tx[${i}] failed — ${message}`,
          );
        }
        results.push({
          index: i,
          txHash: "0x" as Hex,
          error: message,
        });
      }
    }

    return results;
  }
}
