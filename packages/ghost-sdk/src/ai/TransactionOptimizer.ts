/**
 * TransactionOptimizer — AI-driven transaction optimization.
 *
 * Combines GhostAIGasOptimizer fee recommendations with on-chain fee history
 * and mempool analysis to suggest the ideal send timing and gas parameters.
 */

import type { HttpProvider } from "../providers/HttpProvider.js";
import { GhostAIGasOptimizer } from "./GhostAIGasOptimizer.js";
import type { GasOptimizerConfig, GasOptimisationResult, NetworkStats } from "./GhostAIGasOptimizer.js";

export interface TxOptimizationRequest {
  /** Target address */
  to?: `0x${string}`;
  /** Value in wei */
  value?: bigint;
  /** Call data */
  data?: `0x${string}`;
  /** Current nonce (if known) */
  nonce?: number;
  /** Preferred confirmation speed */
  speed?: "fast" | "standard" | "slow";
}

export interface TxOptimizationResult {
  /** Recommended maxFeePerGas */
  maxFeePerGas: bigint;
  /** Recommended maxPriorityFeePerGas */
  maxPriorityFeePerGas: bigint;
  /** Recommended gas limit */
  gasLimit: bigint;
  /** Predicted confirmation blocks */
  estimatedBlocks: number;
  /** Estimated cost in wei (maxFeePerGas × gasLimit) */
  estimatedCost: bigint;
  /** AI confidence 0–1 */
  confidence: number;
  /** Recommendation explanation */
  reason: string;
  /** Speed tier */
  speed: "fast" | "standard" | "slow";
  /** Whether network is currently congested */
  congested: boolean;
  /** Suggested delay (ms) before sending — 0 if now is optimal */
  suggestedDelayMs: number;
}

export interface TransactionOptimizerConfig extends GasOptimizerConfig {
  /** Number of blocks to look back for fee history (default: 20) */
  historyBlocks?: number;
  /** Congestion threshold 0–1: above this, suggest delay (default: 0.8) */
  congestionThreshold?: number;
}

export class TransactionOptimizer {
  private readonly provider: HttpProvider;
  private readonly optimizer: GhostAIGasOptimizer;
  private readonly historyBlocks: number;
  private readonly congestionThreshold: number;

  constructor(
    provider: HttpProvider,
    config: TransactionOptimizerConfig = {},
  ) {
    this.provider = provider;
    this.optimizer = new GhostAIGasOptimizer(config);
    this.historyBlocks = config.historyBlocks ?? 20;
    this.congestionThreshold = config.congestionThreshold ?? 0.8;
  }

  /**
   * Analyze current network conditions and optimize the given transaction.
   */
  async optimize(
    tx: TxOptimizationRequest = {},
  ): Promise<TxOptimizationResult> {
    // Gather network data in parallel
    const [baseFeeHex, blockNumber] = await Promise.all([
      this.provider.getGasPrice(),
      this.provider.getBlockNumber(),
    ]);

    const baseFee = BigInt(baseFeeHex);

    // Fetch fee history for congestion analysis
    let utilisation = 0.5;
    let medianPriorityFee = 1_000_000_000n;

    try {
      const history = await this.provider.getFeeHistory(
        this.historyBlocks,
        "latest",
        [10, 50, 90],
      );

      // Parse utilisation from gasUsedRatio
      if (history.gasUsedRatio?.length) {
        const ratios = history.gasUsedRatio.filter((r: number) => isFinite(r));
        utilisation = ratios.length > 0
          ? ratios.reduce((s: number, r: number) => s + r, 0) / ratios.length
          : 0.5;
      }

      // Parse median priority fee (50th percentile)
      if (history.reward?.length) {
        const last = history.reward[history.reward.length - 1];
        if (last?.[1]) {
          medianPriorityFee = BigInt(last[1]);
        }
      }
    } catch {
      // fee history not available — use defaults
    }

    const congested = utilisation > this.congestionThreshold;

    const stats: NetworkStats = {
      mempoolSize: 0, // mempool size not available via standard RPC
      baseGas: baseFee,
      utilisation,
      medianPriorityFee,
    };

    const gasResult: GasOptimisationResult = this.optimizer.optimize(stats);

    // Estimate gas limit
    let gasLimit = 21_000n;
    if (tx.to && (tx.data && tx.data !== "0x")) {
      try {
        const estimated = await this.provider.estimateGas({
          to: tx.to,
          data: tx.data,
          value: tx.value ?? 0n,
        });
        // Add 20% buffer
        gasLimit = (BigInt(estimated) * 12n) / 10n;
      } catch {
        gasLimit = 200_000n;
      }
    }

    // Suggest delay when network is congested and speed is not "fast"
    const suggestedDelayMs =
      congested && (tx.speed ?? "standard") !== "fast"
        ? this._calcDelay(utilisation)
        : 0;

    const estimatedBlocks = this._estimateBlocks(gasResult.speed, congested);
    const estimatedCost = gasResult.maxFeePerGas * gasLimit;

    return {
      maxFeePerGas: gasResult.maxFeePerGas,
      maxPriorityFeePerGas: gasResult.maxPriorityFeePerGas,
      gasLimit,
      estimatedBlocks,
      estimatedCost,
      confidence: gasResult.confidence,
      reason: gasResult.reason,
      speed: gasResult.speed,
      congested,
      suggestedDelayMs,
    };
  }

  /**
   * Compare three speed tiers and return all estimates together.
   */
  async estimateAll(
    tx: Omit<TxOptimizationRequest, "speed"> = {},
  ): Promise<{
    fast: TxOptimizationResult;
    standard: TxOptimizationResult;
    slow: TxOptimizationResult;
  }> {
    const [fast, standard, slow] = await Promise.all([
      this.optimize({ ...tx, speed: "fast" }),
      this.optimize({ ...tx, speed: "standard" }),
      this.optimize({ ...tx, speed: "slow" }),
    ]);
    return { fast, standard, slow };
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  private _estimateBlocks(
    speed: "fast" | "standard" | "slow",
    congested: boolean,
  ): number {
    const base = speed === "fast" ? 1 : speed === "standard" ? 3 : 8;
    return congested ? base + 2 : base;
  }

  private _calcDelay(utilisation: number): number {
    // Suggest waiting up to 30s proportional to congestion above threshold
    const excess = Math.min(1, (utilisation - this.congestionThreshold) / (1 - this.congestionThreshold));
    return Math.round(excess * 30_000);
  }
}
