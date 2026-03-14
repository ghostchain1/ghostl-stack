/**
 * GhostGasEngine
 *
 * Ghost-branded gas estimation and fee management layer.
 * Wraps ethers v6 fee data with GST-specific semantics.
 */

import type { Provider, BigNumberish } from "ethers";
import { formatUnits, parseUnits } from "ethers";

export interface GhostFeeData {
  /** Gas price in GhostWei (legacy non-EIP-1559 chains). */
  ghostGasPrice: bigint | null;
  /** EIP-1559 base fee in GhostWei per gas unit. */
  ghostBaseFee: bigint | null;
  /** EIP-1559 max priority fee (miner tip) in GhostWei. */
  ghostPriorityFee: bigint | null;
  /** Recommended max fee per gas (EIP-1559) in GhostWei. */
  ghostMaxFee: bigint | null;
}

export interface GhostGasEstimate {
  /** Estimated gas units required. */
  gasLimit: bigint;
  /** Recommended gas price / max fee in GhostWei. */
  gasPrice: bigint;
  /** Total cost in GhostWei (gasLimit × gasPrice). */
  totalGhostWei: bigint;
  /** Total cost formatted as Ghost (18 decimals). */
  totalGhostFormatted: string;
}

/**
 * GhostGasEngine — ghost-branded fee oracle.
 *
 * ```ts
 * const engine = new GhostGasEngine(l2Provider);
 * const fees   = await engine.getGhostFees();
 * const est    = await engine.estimateGhostGas({ to, data });
 * ```
 */
export class GhostGasEngine {
  constructor(private readonly provider: Provider) {}

  /**
   * Fetch current GST-denominated fee data from the network.
   */
  async getGhostFees(): Promise<GhostFeeData> {
    const raw = await this.provider.getFeeData();
    return {
      ghostGasPrice:    raw.gasPrice,
      ghostBaseFee:     raw.maxFeePerGas ? raw.maxFeePerGas - (raw.maxPriorityFeePerGas ?? 0n) : null,
      ghostPriorityFee: raw.maxPriorityFeePerGas,
      ghostMaxFee:      raw.maxFeePerGas,
    };
  }

  /**
   * Estimate total GST cost for a transaction.
   *
   * @param tx  Partial transaction object passed to `provider.estimateGas`.
   */
  async estimateGhostGas(tx: {
    to?: string;
    from?: string;
    data?: string;
    value?: BigNumberish;
  }): Promise<GhostGasEstimate> {
    const [gasLimit, feeData] = await Promise.all([
      this.provider.estimateGas(tx),
      this.provider.getFeeData(),
    ]);

    const gasPrice = feeData.maxFeePerGas ?? feeData.gasPrice ?? parseUnits("1", "gwei");
    const totalGhostWei = gasLimit * gasPrice;

    return {
      gasLimit,
      gasPrice,
      totalGhostWei,
      totalGhostFormatted: formatUnits(totalGhostWei, 18),
    };
  }

  /**
   * Convert a gas price in GhostGwei to GhostWei.
   */
  static ghostGweiToGhostWei(ghostGwei: string): bigint {
    return parseUnits(ghostGwei, 9);
  }

  /**
   * Convert GhostWei gas price to a formatted GhostGwei string.
   */
  static ghostWeiToGhostGwei(ghostWei: BigNumberish): string {
    return formatUnits(ghostWei, 9);
  }
}
