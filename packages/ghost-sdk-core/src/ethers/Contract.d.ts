import { BaseContract, type ContractRunner } from "./BaseContract";
import type { GhostABIFragment } from "../types";
/**
 * A dynamic Contract that exposes ABI functions directly as
 * `contract.methodName(args)` — read calls return decoded values,
 * write calls return a ContractTransactionResponse.
 */
export declare class Contract extends BaseContract {
    [method: string]: unknown;
    constructor(address: string, abi: GhostABIFragment[] | string, runner: ContractRunner);
    private _installMethods;
}
