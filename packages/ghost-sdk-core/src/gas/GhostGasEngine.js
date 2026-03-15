"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.GhostGasEngine = void 0;
class GhostGasEngine {
    provider;
    constructor(provider) {
        this.provider = provider;
    }
    async estimate(tx) {
        return this.provider.estimateGas(tx);
    }
    async getGasPrice() {
        return this.provider.getGasPrice();
    }
    /** Returns suggested EIP-1559 fee values */
    async getFeeData() {
        const [gasPrice, block] = await Promise.all([
            this.provider.getGasPrice(),
            this.provider.getBlock("latest")
        ]);
        // Base fee is not directly exposed on all chains; approximate from gas price
        const priorityFee = gasPrice / 10n; // 10% tip suggestion
        return {
            gasPrice,
            maxFeePerGas: gasPrice * 2n,
            maxPriorityFeePerGas: priorityFee
        };
    }
}
exports.GhostGasEngine = GhostGasEngine;
