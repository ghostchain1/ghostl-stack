import { GhostProvider } from "../provider/GhostProvider";
import type { TransactionReceipt, TransactionRequest, Log } from "./types";
import type { GhostBlock } from "../types";
export declare abstract class Provider {
    abstract getNetwork(): Promise<{
        name: string;
        chainId: bigint;
    }>;
    abstract getBlockNumber(): Promise<number>;
    abstract getBalance(address: string, tag?: string): Promise<bigint>;
    abstract getTransactionCount(address: string, tag?: string): Promise<number>;
    abstract getCode(address: string, tag?: string): Promise<string>;
    abstract getBlock(blockTag: string | number): Promise<GhostBlock | null>;
    abstract getTransaction(hash: string): Promise<Record<string, unknown> | null>;
    abstract getTransactionReceipt(hash: string): Promise<TransactionReceipt | null>;
    abstract call(tx: TransactionRequest): Promise<string>;
    abstract estimateGas(tx: TransactionRequest): Promise<bigint>;
    abstract getFeeData(): Promise<{
        gasPrice: bigint | null;
        maxFeePerGas: bigint | null;
        maxPriorityFeePerGas: bigint | null;
    }>;
    abstract getLogs(filter: {
        fromBlock?: string | number;
        toBlock?: string | number;
        address?: string | string[];
        topics?: (string | string[] | null)[];
    }): Promise<Log[]>;
    abstract sendRawTransaction(signedTx: string): Promise<string>;
    abstract waitForTransaction(hash: string, confirms?: number, timeoutMs?: number): Promise<TransactionReceipt>;
    abstract resolveName(name: string): Promise<string | null>;
}
export declare class JsonRpcProvider extends Provider {
    protected _ghost: GhostProvider;
    protected _url: string;
    private _chainId;
    constructor(url: string);
    /** Create a provider already connected to a named GhostChain layer. */
    static forLayer(layer: "L1" | "L2" | "L3", rpcOverride?: string): JsonRpcProvider;
    static forL1(rpcOverride?: string): JsonRpcProvider;
    static forL2(rpcOverride?: string): JsonRpcProvider;
    static forL3(rpcOverride?: string): JsonRpcProvider;
    getNetwork(): Promise<{
        name: string;
        chainId: bigint;
    }>;
    getBlockNumber(): Promise<number>;
    getBalance(address: string, tag?: string): Promise<bigint>;
    getTransactionCount(address: string, tag?: string): Promise<number>;
    getCode(address: string, tag?: string): Promise<string>;
    getBlock(blockTag: string | number): Promise<GhostBlock | null>;
    getTransaction(hash: string): Promise<Record<string, unknown> | null>;
    getTransactionReceipt(hash: string): Promise<TransactionReceipt | null>;
    call(tx: TransactionRequest): Promise<string>;
    estimateGas(tx: TransactionRequest): Promise<bigint>;
    getFeeData(): Promise<{
        gasPrice: bigint | null;
        maxFeePerGas: bigint | null;
        maxPriorityFeePerGas: bigint | null;
    }>;
    getLogs(filter: {
        fromBlock?: string | number;
        toBlock?: string | number;
        address?: string | string[];
        topics?: (string | string[] | null)[];
    }): Promise<Log[]>;
    sendRawTransaction(signedTx: string): Promise<string>;
    waitForTransaction(hash: string, confirms?: number, timeoutMs?: number): Promise<TransactionReceipt>;
    /** GNS not available on GhostChain – returns null for all names. */
    resolveName(name: string): Promise<string | null>;
    /** Access the underlying GhostProvider for advanced use. */
    get ghost(): GhostProvider;
}
