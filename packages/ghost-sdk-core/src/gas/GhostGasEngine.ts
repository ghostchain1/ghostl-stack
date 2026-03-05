import { GhostProvider } from "../provider/GhostProvider";
import type { GhostTransactionRequest } from "../types";

export class GhostGasEngine {
  constructor(private provider: GhostProvider) {}

  async estimate(tx: GhostTransactionRequest): Promise<bigint> {
    return this.provider.estimateGas(tx);
  }

  async getGasPrice(): Promise<bigint> {
    return this.provider.getGasPrice();
  }

  /** Returns suggested EIP-1559 fee values */
  async getFeeData(): Promise<{
    gasPrice: bigint;
    maxFeePerGas: bigint;
    maxPriorityFeePerGas: bigint;
  }> {
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
