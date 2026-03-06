/**
 * GhostFeeEstimator — intelligent gas fee estimation for GhostChain.
 *
 * Uses fee history to compute dynamic baseFee + priority fee recommendations
 * with configurable congestion tolerance.
 *
 * Usage:
 *   const estimator = new GhostFeeEstimator(provider)
 *   const fees = await estimator.estimate()
 *   const gasLimit = await estimator.estimateGas({ to, data })
 */

import type { HttpProvider } from "../providers/HttpProvider.js";
import { hexToBigInt } from "../native/hex.js";
import type { GhostFeeSuggestion, Hex, GhostAddress } from "../native/types.js";

export type GhostFeeEstimate = {
  baseFeePerGas: bigint;
  /** Conservative: suitable for most transactions */
  slow: GhostFeeSuggestion;
  /** Standard: likely to be mined within 1-3 blocks */
  standard: GhostFeeSuggestion;
  /** Aggressive: high priority, near-instant inclusion */
  fast: GhostFeeSuggestion;
  /** Congestion 0.0–1.0 (1.0 = extremely congested) */
  congestion: number;
};

export type GhostFeeEstimatorOptions = {
  /** Number of historical blocks to analyze (default: 10) */
  historyBlocks?: number;
  /** Priority fee percentiles [slow, standard, fast] (default: [25, 50, 90]) */
  percentiles?: [number, number, number];
  /** Base fee safety multiplier (default: 1.25) */
  baseFeeMultiplier?: number;
};

export class GhostFeeEstimator {
  private readonly opts: Required<GhostFeeEstimatorOptions>;

  constructor(private readonly provider: HttpProvider, opts: GhostFeeEstimatorOptions = {}) {
    this.opts = {
      historyBlocks: opts.historyBlocks ?? 10,
      percentiles: opts.percentiles ?? [25, 50, 90],
      baseFeeMultiplier: opts.baseFeeMultiplier ?? 1.25,
    };
  }

  async estimate(): Promise<GhostFeeEstimate> {
    const history = await this.provider.getFeeHistory(
      this.opts.historyBlocks,
      "latest",
      this.opts.percentiles as unknown as number[]
    );

    const baseFees = (history.baseFeePerGas ?? []).map(h => hexToBigInt(h as Hex));
    const currentBase = baseFees[baseFees.length - 1] ?? 10_000_000_000n;
    const nextBase = this._mul(currentBase, this.opts.baseFeeMultiplier);

    // Compute priority fee from reward percentiles
    const rewards = history.reward ?? [];
    const [slowP, stdP, fastP] = this._avgRewards(rewards);

    const slow: GhostFeeSuggestion = {
      baseFeePerGas: currentBase,
      maxPriorityFeePerGas: slowP,
      maxFeePerGas: nextBase + slowP,
    };
    const standard: GhostFeeSuggestion = {
      baseFeePerGas: currentBase,
      maxPriorityFeePerGas: stdP,
      maxFeePerGas: nextBase + stdP,
    };
    const fast: GhostFeeSuggestion = {
      baseFeePerGas: currentBase,
      maxPriorityFeePerGas: fastP,
      maxFeePerGas: nextBase + fastP,
    };

    // Congestion: ratio of average gas used ratio
    const gasRatios = history.gasUsedRatio ?? [];
    const avgGasRatio = gasRatios.length > 0
      ? gasRatios.reduce((a, b) => a + b, 0) / gasRatios.length
      : 0.5;

    return { baseFeePerGas: currentBase, slow, standard, fast, congestion: avgGasRatio };
  }

  async estimateGas(params: {
    to?: GhostAddress;
    from?: GhostAddress;
    data?: Hex;
    value?: bigint;
  }): Promise<bigint> {
    return this.provider.estimateGas(params);
  }

  /** Full estimate + gas limit for a specific call. */
  async estimateAll(params: {
    to?: GhostAddress;
    from?: GhostAddress;
    data?: Hex;
    value?: bigint;
    gasLimitPad?: number;
  }): Promise<{ fees: GhostFeeEstimate; gasLimit: bigint }> {
    const [fees, rawGas] = await Promise.all([
      this.estimate(),
      this.provider.estimateGas({ to: params.to, from: params.from, data: params.data, value: params.value }),
    ]);
    const pad = params.gasLimitPad ?? 1.2;
    const gasLimit = this._mul(rawGas, pad);
    return { fees, gasLimit };
  }

  private _mul(v: bigint, m: number): bigint {
    return (v * BigInt(Math.floor(m * 1000))) / 1000n;
  }

  private _avgRewards(rewards: Hex[][]): [bigint, bigint, bigint] {
    if (!rewards.length) return [1_000_000_000n, 2_000_000_000n, 5_000_000_000n];
    const sums = [0n, 0n, 0n];
    for (const row of rewards) {
      for (let i = 0; i < 3; i++) {
        sums[i] = (sums[i]! + hexToBigInt((row[i] ?? "0x0") as Hex));
      }
    }
    const len = BigInt(rewards.length);
    return [sums[0]! / len, sums[1]! / len, sums[2]! / len];
  }
}
