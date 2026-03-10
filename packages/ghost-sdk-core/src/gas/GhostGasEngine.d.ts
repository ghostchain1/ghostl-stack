import { GhostProvider } from "../provider/GhostProvider";
import type { GhostTransactionRequest } from "../types";
export declare class GhostGasEngine {
    private provider;
    constructor(provider: GhostProvider);
    estimate(tx: GhostTransactionRequest): Promise<bigint>;
    getGasPrice(): Promise<bigint>;
    /** Returns suggested EIP-1559 fee values */
    getFeeData(): Promise<{
        gasPrice: bigint;
        maxFeePerGas: bigint;
        maxPriorityFeePerGas: bigint;
    }>;
}
