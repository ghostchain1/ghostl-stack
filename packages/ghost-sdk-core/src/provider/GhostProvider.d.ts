import { GhostJsonRpc } from "../rpc/GhostJsonRpc";
import type { GhostBlock, GhostTransactionReceipt, GhostTransactionRequest, GhostCallOverride } from "../types";
export declare class GhostProvider {
    readonly rpc: GhostJsonRpc;
    constructor(url: string, options?: {
        timeoutMs?: number;
    });
    getBlockNumber(): Promise<number>;
    getBalance(address: string, tag?: string): Promise<bigint>;
    getTransactionCount(address: string, tag?: string): Promise<number>;
    getGasPrice(): Promise<bigint>;
    getBlock(blockHashOrNumber: string | number | "latest"): Promise<GhostBlock>;
    getTransactionReceipt(txHash: string): Promise<GhostTransactionReceipt | null>;
    sendRawTransaction(tx: string): Promise<string>;
    call(override: GhostCallOverride, tag?: string): Promise<string>;
    estimateGas(tx: GhostTransactionRequest): Promise<bigint>;
    getChainId(): Promise<number>;
    getCode(address: string, tag?: string): Promise<string>;
    getLogs(filter: {
        fromBlock?: string | number;
        toBlock?: string | number;
        address?: string | string[];
        topics?: (string | string[] | null)[];
    }): Promise<unknown>;
    /** @alias ghost_getBalance */
    ghost_getBalance(address: string, tag?: string): Promise<bigint>;
    /** @alias ghost_blockNumber */
    ghost_blockNumber(): Promise<number>;
    /** @alias ghost_sendRawTransaction */
    ghost_sendRawTransaction(tx: string): Promise<string>;
    /** @alias ghost_call */
    ghost_call(override: GhostCallOverride, tag?: string): Promise<string>;
    /** @alias ghost_estimateGas */
    ghost_estimateGas(tx: GhostTransactionRequest): Promise<bigint>;
    /** @alias ghost_chainId */
    ghost_chainId(): Promise<number>;
    /** @alias ghost_getLogs */
    ghost_getLogs(filter: {
        fromBlock?: string | number;
        toBlock?: string | number;
        address?: string | string[];
        topics?: (string | string[] | null)[];
    }): Promise<unknown>;
    /**
     * ghost_getNodeInfo — GhostChain-specific: returns node identity, layer, and chain metadata.
     * Falls back to `ghost_nodeInfo` or `web3_clientVersion` if unavailable.
     */
    ghost_getNodeInfo(): Promise<{
        chainId: number;
        layer: string;
        version: string;
    } | null>;
}
