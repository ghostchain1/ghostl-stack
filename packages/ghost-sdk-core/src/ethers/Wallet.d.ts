import { JsonRpcProvider } from "./Provider";
import type { TransactionRequest, ContractTransactionResponse, BigNumberish } from "./types";
import type { GhostTypedDataDomain, GhostTypedDataTypes } from "../types";
type LayerKey = "L1" | "L2" | "L3";
export declare class Wallet {
    private readonly _ghost;
    private _provider;
    private _nonces;
    constructor(privateKey: string, provider?: JsonRpcProvider);
    static createRandom(provider?: JsonRpcProvider): Wallet;
    /** Create from mnemonic is not natively supported; throws with clear message. */
    static fromPhrase(_mnemonic: string): never;
    /** Convenience: wallet connected to GhostChain L1 / L2 / L3. */
    static forLayer(privateKey: string, layer: LayerKey, rpcOverride?: string): Wallet;
    static forL1(privateKey: string, rpcOverride?: string): Wallet;
    static forL2(privateKey: string, rpcOverride?: string): Wallet;
    static forL3(privateKey: string, rpcOverride?: string): Wallet;
    connect(provider: JsonRpcProvider): Wallet;
    get provider(): JsonRpcProvider | null;
    get address(): string;
    get publicKey(): string;
    get privateKey(): string;
    getBalance(tag?: string): Promise<bigint>;
    getTransactionCount(tag?: string): Promise<number>;
    /** Sign a raw message (EIP-191). Returns 65-byte hex. */
    signMessage(message: string | Uint8Array): Promise<string>;
    /** Sign an EIP-712 typed data payload. */
    signTypedData(domain: GhostTypedDataDomain, types: GhostTypedDataTypes, value: Record<string, unknown>): Promise<string>;
    /** Sign a TransactionRequest without broadcasting. Returns raw signed hex. */
    signTransaction(tx: TransactionRequest): Promise<string>;
    /** Sign and broadcast a transaction. Returns ContractTransactionResponse. */
    sendTransaction(tx: TransactionRequest): Promise<ContractTransactionResponse>;
    /** GST transfer shorthand. */
    sendEther(to: string, value: BigNumberish): Promise<ContractTransactionResponse>;
    private _requireProvider;
    private _setProvider;
    private _detectLayer;
    private _nextNonce;
    private _buildResponse;
}
export {};
