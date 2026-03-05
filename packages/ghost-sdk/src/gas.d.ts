/**
 * GhostGasEngine
 *
 * Ghost-branded gas estimation and fee management layer.
 * Wraps ethers v6 fee data with GST-specific semantics.
 */
import type { Provider, BigNumberish } from "ethers";
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
export declare class GhostGasEngine {
    private readonly provider;
    constructor(provider: Provider);
    /**
     * Fetch current GST-denominated fee data from the network.
     */
    getGhostFees(): Promise<GhostFeeData>;
    /**
     * Estimate total GST cost for a transaction.
     *
     * @param tx  Partial transaction object passed to `provider.estimateGas`.
     */
    estimateGhostGas(tx: {
        to?: string;
        from?: string;
        data?: string;
        value?: BigNumberish;
    }): Promise<GhostGasEstimate>;
    /**
     * Convert a gas price in GhostGwei to GhostWei.
     */
    static ghostGweiToGhostWei(ghostGwei: string): bigint;
    /**
     * Convert GhostWei gas price to a formatted GhostGwei string.
     */
    static ghostWeiToGhostGwei(ghostWei: BigNumberish): string;
}
//# sourceMappingURL=gas.d.ts.map