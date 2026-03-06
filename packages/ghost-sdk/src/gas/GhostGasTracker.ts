/**
 * GhostGasTracker — native gas price tracker and estimator.
 *
 * Pure HttpProvider implementation — zero ethers dependency.
 * Tracks historical gas prices, provides fee suggestions, and
 * calculates optimal EIP-1559 fee parameters.
 */

import type { GhostAddress, Hex, GhostFeeSuggestion } from "../native/types.js";
import type { HttpProvider } from "../providers/HttpProvider.js";
import { hexToBigInt } from "../native/hex.js";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface GhostGasSnapshot {
  /** Current block's base fee per gas (EIP-1559), in wei. */
  baseFeePerGas: bigint;
  /** Suggested max priority fee per gas (miner tip), in wei. */
  maxPriorityFeePerGas: bigint;
  /** Recommended max fee per gas = baseFee * 2 + priorityFee. */
  maxFeePerGas: bigint;
  /** Legacy gas price (for non-EIP-1559 fallback). */
  gasPrice: bigint;
  /** Block number this snapshot was taken at. */
  blockNumber: bigint;
  /** Unix timestamp of snapshot. */
  timestamp: number;
}

export interface GhostGasEstimate {
  /** Units of gas required for the transaction. */
  gasLimit: bigint;
  /** Suggested max fee per gas (EIP-1559). */
  maxFeePerGas: bigint;
  /** Suggested max priority fee per gas (EIP-1559). */
  maxPriorityFeePerGas: bigint;
  /** Total cost estimate in wei (gasLimit × maxFeePerGas). */
  totalWei: bigint;
  /** Total cost formatted as decimal string (18 decimals). */
  totalGhostFormatted: string;
}

export interface GhostGasHistoryEntry {
  blockNumber: bigint;
  baseFeePerGas: bigint;
  gasUsedRatio: number;
  priorityFeePercentile50: bigint;
}

export type GhostSpeedPreset = "slow" | "standard" | "fast" | "instant";

export interface GhostGasTrackerConfig {
  /** Number of recent blocks to include in fee history. Default 10. */
  historyBlocks?: number;
  /** Multiplier on base fee for standard speed. Default 1.5. */
  standardMultiplier?: number;
  /** Multiplier on base fee for fast speed. Default 2.0. */
  fastMultiplier?: number;
  /** Multiplier on base fee for instant speed. Default 3.0. */
  instantMultiplier?: number;
}

// ── GhostGasTracker ───────────────────────────────────────────────────────────

/**
 * GhostGasTracker — native EIP-1559 gas tracker.
 *
 * ```ts
 * const tracker = new GhostGasTracker(provider);
 * const snap    = await tracker.snapshot();
 * const suggest = await tracker.suggestFees("fast");
 * ```
 */
export class GhostGasTracker {
  private readonly historyBlocks: number;
  private readonly standardMultiplier: number;
  private readonly fastMultiplier: number;
  private readonly instantMultiplier: number;

  constructor(
    private readonly provider: HttpProvider,
    config: GhostGasTrackerConfig = {},
  ) {
    this.historyBlocks = config.historyBlocks ?? 10;
    this.standardMultiplier = config.standardMultiplier ?? 1.5;
    this.fastMultiplier = config.fastMultiplier ?? 2.0;
    this.instantMultiplier = config.instantMultiplier ?? 3.0;
  }

  /**
   * Get a current gas price snapshot.
   */
  async snapshot(): Promise<GhostGasSnapshot> {
    const [blockNumber, gasPrice, feeHistory] = await Promise.all([
      this.provider.getBlockNumber(),
      this.provider.getGasPrice(),
      this.provider.getFeeHistory(5, "latest", [50]).catch(() => null),
    ]);

    const lastBaseFeeHex = feeHistory?.baseFeePerGas?.[feeHistory.baseFeePerGas.length - 1];
    const baseFeePerGas = lastBaseFeeHex ? hexToBigInt(lastBaseFeeHex) : 0n;
    const lastRewardHex = feeHistory?.reward?.[feeHistory.reward.length - 1]?.[0];
    const priorityFee50 = lastRewardHex ? hexToBigInt(lastRewardHex) : 1_000_000_000n;

    // gasPrice is already a bigint from getGasPrice()
    const maxFeePerGas = baseFeePerGas * 2n + priorityFee50;

    return {
      baseFeePerGas,
      maxPriorityFeePerGas: priorityFee50,
      maxFeePerGas,
      gasPrice,
      blockNumber,
      timestamp: Date.now(),
    };
  }

  /**
   * Suggest EIP-1559 fee parameters for a given speed preset.
   */
  async suggestFees(speed: GhostSpeedPreset = "standard"): Promise<GhostFeeSuggestion> {
    const snap = await this.snapshot();

    const multiplier =
      speed === "slow"
        ? 1.0
        : speed === "standard"
          ? this.standardMultiplier
          : speed === "fast"
            ? this.fastMultiplier
            : this.instantMultiplier;

    const maxFeePerGas = BigInt(Math.ceil(Number(snap.baseFeePerGas) * multiplier)) + snap.maxPriorityFeePerGas;
    return {
      maxFeePerGas,
      maxPriorityFeePerGas: snap.maxPriorityFeePerGas,
      baseFeePerGas: snap.baseFeePerGas,
    };
  }

  /**
   * Estimate gas + fees for a transaction call.
   */
  async estimateGas(tx: {
    to: GhostAddress;
    data?: Hex;
    from?: GhostAddress;
    value?: bigint;
  }, speed: GhostSpeedPreset = "standard"): Promise<GhostGasEstimate> {
    const [gasLimit, fees] = await Promise.all([
      this.provider.estimateGas(tx),
      this.suggestFees(speed),
    ]);

    const totalWei = gasLimit * fees.maxFeePerGas;
    const totalGhostFormatted = formatWei(totalWei);

    return {
      gasLimit,
      maxFeePerGas: fees.maxFeePerGas,
      maxPriorityFeePerGas: fees.maxPriorityFeePerGas,
      totalWei,
      totalGhostFormatted,
    };
  }

  /**
   * Get fee history from the last N blocks.
   */
  async history(): Promise<GhostGasHistoryEntry[]> {
    const feeHistory = await this.provider.getFeeHistory(
      this.historyBlocks,
      "latest",
      [50],
    );
    const entries: GhostGasHistoryEntry[] = [];
    const blockCount = feeHistory.baseFeePerGas?.length ?? 0;
    for (let i = 0; i < blockCount - 1; i++) {
      const bfHex = feeHistory.baseFeePerGas?.[i];
      const rewardHex = feeHistory.reward?.[i]?.[0];
      entries.push({
        blockNumber: BigInt(i),
        baseFeePerGas: bfHex ? hexToBigInt(bfHex) : 0n,
        gasUsedRatio: feeHistory.gasUsedRatio?.[i] ?? 0,
        priorityFeePercentile50: rewardHex ? hexToBigInt(rewardHex) : 0n,
      });
    }
    return entries;
  }
}

// ── GhostGasOracle (singleton/factory) ───────────────────────────────────────

/** Create a configured GhostGasTracker for L1. */
export function createL1GasTracker(_rpcUrl?: string, _config?: GhostGasTrackerConfig): never {
  throw new Error("createL1GasTracker: instantiate HttpProvider manually and pass to new GhostGasTracker(provider)");
}

// ── Formatting utilities ──────────────────────────────────────────────────────

/**
 * Format wei as a decimal Ghost string (18 decimals).
 * e.g. 1_000_000_000_000_000_000n → "1.0"
 */
export function formatWei(wei: bigint, decimals = 18): string {
  const divisor = 10n ** BigInt(decimals);
  const whole = wei / divisor;
  const fraction = wei % divisor;
  if (fraction === 0n) return `${whole}`;
  const fractionStr = fraction.toString().padStart(decimals, "0").replace(/0+$/, "");
  return `${whole}.${fractionStr}`;
}

/**
 * Format wei as Gwei string (9 decimals).
 */
export function formatGwei(wei: bigint): string {
  return formatWei(wei, 9);
}

/**
 * Parse a decimal Ghost string to wei.
 * e.g. "1.5" → 1_500_000_000_000_000_000n
 */
export function parseGhost(value: string, decimals = 18): bigint {
  const [whole, frac = ""] = value.split(".");
  const fracPadded = frac.padEnd(decimals, "0").slice(0, decimals);
  return BigInt(whole ?? "0") * 10n ** BigInt(decimals) + BigInt(fracPadded);
}

/**
 * Parse a Gwei string to wei.
 */
export function parseGwei(value: string): bigint {
  return parseGhost(value, 9);
}
