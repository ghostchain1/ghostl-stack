/** Any value representable as a BigInt: number, string ("0x…" or decimal), or bigint. */
export type BigNumberish = bigint | number | string;
export declare function toBigInt(value: BigNumberish): bigint;
export declare function toNumber(value: BigNumberish): number;
/** Any value representable as raw bytes: hex string or Uint8Array. */
export type BytesLike = string | Uint8Array;
export declare function toBytes(value: BytesLike): Uint8Array;
export declare function toHexString(value: BytesLike): string;
/** ethers-compatible transaction request. */
export interface TransactionRequest {
    to?: string;
    from?: string;
    nonce?: BigNumberish;
    gasLimit?: BigNumberish;
    gasPrice?: BigNumberish;
    data?: BytesLike;
    value?: BigNumberish;
    chainId?: BigNumberish;
    type?: number;
    maxFeePerGas?: BigNumberish;
    maxPriorityFeePerGas?: BigNumberish;
    accessList?: Array<{
        address: string;
        storageKeys: string[];
    }>;
}
export interface Log {
    address: string;
    topics: string[];
    data: string;
    blockNumber: number;
    blockHash: string;
    transactionHash: string;
    transactionIndex: number;
    logIndex: number;
    removed: boolean;
}
export interface TransactionReceipt {
    hash: string;
    blockHash: string;
    blockNumber: number;
    index: number;
    from: string;
    to: string | null;
    contractAddress: string | null;
    gasUsed: bigint;
    cumulativeGasUsed: bigint;
    effectiveGasPrice: bigint;
    status: 0 | 1 | null;
    logs: Log[];
    logsBloom: string;
    type: number;
}
export interface ContractTransactionResponse {
    hash: string;
    blockNumber: number | null;
    blockHash: string | null;
    from: string;
    to: string | null;
    nonce: number;
    gasLimit: bigint;
    gasPrice: bigint | null;
    maxFeePerGas: bigint | null;
    maxPriorityFeePerGas: bigint | null;
    value: bigint;
    data: string;
    chainId: bigint;
    type: number;
    /**
     * Wait for the transaction to be mined and return its receipt.
     * @param confirms number of confirmations to wait for (default 1)
     */
    wait(confirms?: number): Promise<TransactionReceipt>;
    /**
     * Returns a JSON-serialisable form of this response (no circular refs).
     */
    toJSON(): Record<string, unknown>;
}
