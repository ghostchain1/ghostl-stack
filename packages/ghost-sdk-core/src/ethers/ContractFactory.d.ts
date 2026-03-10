import { Interface } from "./Interface";
import { Contract } from "./Contract";
import type { GhostABIFragment } from "../types";
import type { ContractTransactionResponse, TransactionReceipt } from "./types";
/** A deployed contract handle returned from ContractFactory.deploy() */
export interface DeployedContract {
    target: string;
    contract: Contract;
    deploymentReceipt: TransactionReceipt;
    deployTransaction: ContractTransactionResponse;
}
export declare class ContractFactory {
    readonly interface: Interface;
    readonly bytecode: string;
    private _runner;
    constructor(abi: GhostABIFragment[] | string, bytecode: string, runner: any);
    /** Connect to a different runner (signer). */
    connect(runner: any): ContractFactory;
    /**
     * Encode the deployment transaction data (bytecode + constructor args).
     * Call this if you need the raw data without broadcasting.
     */
    getDeployTransaction(...args: unknown[]): {
        data: string;
        value?: bigint;
    };
    /**
     * Deploy the contract on-chain.
     * @param args Constructor arguments. Last arg may be `{ value: bigint }` overrides.
     */
    deploy(...args: unknown[]): Promise<DeployedContract>;
}
