"use strict";
/**
 * GhostGasEngine
 *
 * Ghost-branded gas estimation and fee management layer.
 * Wraps ethers v6 fee data with GST-specific semantics.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.GhostGasEngine = void 0;
const ethers_1 = require("ethers");
/**
 * GhostGasEngine — ghost-branded fee oracle.
 *
 * ```ts
 * const engine = new GhostGasEngine(l2Provider);
 * const fees   = await engine.getGhostFees();
 * const est    = await engine.estimateGhostGas({ to, data });
 * ```
 */
class GhostGasEngine {
    provider;
    constructor(provider) {
        this.provider = provider;
    }
    /**
     * Fetch current GST-denominated fee data from the network.
     */
    async getGhostFees() {
        const raw = await this.provider.getFeeData();
        return {
            ghostGasPrice: raw.gasPrice,
            ghostBaseFee: raw.maxFeePerGas ? raw.maxFeePerGas - (raw.maxPriorityFeePerGas ?? 0n) : null,
            ghostPriorityFee: raw.maxPriorityFeePerGas,
            ghostMaxFee: raw.maxFeePerGas,
        };
    }
    /**
     * Estimate total GST cost for a transaction.
     *
     * @param tx  Partial transaction object passed to `provider.estimateGas`.
     */
    async estimateGhostGas(tx) {
        const [gasLimit, feeData] = await Promise.all([
            this.provider.estimateGas(tx),
            this.provider.getFeeData(),
        ]);
        const gasPrice = feeData.maxFeePerGas ?? feeData.gasPrice ?? (0, ethers_1.parseUnits)("1", "gwei");
        const totalGhostWei = gasLimit * gasPrice;
        return {
            gasLimit,
            gasPrice,
            totalGhostWei,
            totalGhostFormatted: (0, ethers_1.formatUnits)(totalGhostWei, 18),
        };
    }
    /**
     * Convert a gas price in GhostGwei to GhostWei.
     */
    static ghostGweiToGhostWei(ghostGwei) {
        return (0, ethers_1.parseUnits)(ghostGwei, 9);
    }
    /**
     * Convert GhostWei gas price to a formatted GhostGwei string.
     */
    static ghostWeiToGhostGwei(ghostWei) {
        return (0, ethers_1.formatUnits)(ghostWei, 9);
    }
}
exports.GhostGasEngine = GhostGasEngine;
