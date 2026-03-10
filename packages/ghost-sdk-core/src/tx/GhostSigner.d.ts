import { GhostWallet } from "../wallet/GhostWallet";
import { GhostProvider } from "../provider/GhostProvider";
import { GhostTransaction } from "./GhostTransaction";
import type { GhostTransactionReceipt } from "../types";
/** Fields the caller provides – signer fills in nonce, gas, chainId. */
export interface SendParams {
    to?: string;
    value?: bigint;
    data?: string;
    gasLimit?: bigint;
    maxFeePerGas?: bigint;
    maxPriorityFeePerGas?: bigint;
    /** Override nonce (auto-managed if omitted). */
    nonce?: number;
    /** EIP-2930 access list (optional). */
    accessList?: GhostTransaction["accessList"];
}
export type Layer = "L1" | "L2" | "L3";
export declare class GhostSigner {
    readonly wallet: GhostWallet;
    readonly provider: GhostProvider;
    readonly layer: Layer;
    private nonces;
    private gas;
    constructor(wallet: GhostWallet, layer: Layer, rpcOverride?: string);
    /**
     * Build, fill, and sign an EIP-1559 transaction.
     * Returns the 0x-prefixed raw transaction hex.
     */
    sign(params: SendParams): Promise<string>;
    /**
     * Sign and broadcast. Returns the transaction hash.
     */
    send(params: SendParams): Promise<string>;
    /**
     * Sign, broadcast, and wait for first confirmation.
     * Returns the TransactionReceipt.
     */
    sendAndWait(params: SendParams, timeoutMs?: number): Promise<GhostTransactionReceipt>;
    /** Current on-chain balance of the signer address. */
    balance(): Promise<bigint>;
    /** GST transfer shorthand. */
    sendEther(to: string, value: bigint): Promise<string>;
    private _waitForReceipt;
}
export interface GhostSignerSet {
    L1: GhostSigner;
    L2: GhostSigner;
    L3: GhostSigner;
}
export declare function createSigners(privateKey: string, rpcOverrides?: Partial<Record<Layer, string>>): GhostSignerSet;
