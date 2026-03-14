import { Interface } from "./Interface";
import { JsonRpcProvider } from "./Provider";
import type { ContractTransactionResponse, BigNumberish } from "./types";
import type { GhostABIFragment } from "../types";
export type ContractRunner = JsonRpcProvider | {
    provider: JsonRpcProvider;
    address: string;
};
export declare class BaseContract {
    readonly target: string;
    readonly interface: Interface;
    protected _runner: ContractRunner;
    constructor(address: string, abi: GhostABIFragment[] | string, runner: ContractRunner);
    get provider(): JsonRpcProvider;
    /** Connect this contract to a different runner (provider or signer). */
    connect(runner: ContractRunner): this;
    /** Low-level eth_call. Returns raw hex result. */
    _call(method: string, args: unknown[]): Promise<string>;
    /** Low-level eth_sendRawTransaction (requires signer runner). */
    _send(method: string, args: unknown[], value?: BigNumberish): Promise<ContractTransactionResponse>;
    /** Query event logs and decode them with the ABI. */
    queryFilter(event: string, fromBlock?: number | string, toBlock?: number | string): Promise<{
        args: Record<string, unknown>;
        address: string;
        topics: string[];
        data: string;
        blockNumber: number;
        blockHash: string;
        transactionHash: string;
        transactionIndex: number;
        logIndex: number;
        removed: boolean;
    }[]>;
    protected _buildResponse(hash: string): ContractTransactionResponse;
}
