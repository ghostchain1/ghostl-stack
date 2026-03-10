import type { GhostABIFragment, GhostLog } from "../types";
import type { BytesLike } from "./types";
export type JsonFragment = GhostABIFragment;
export interface FunctionFragment {
    name: string;
    inputs: {
        name: string;
        type: string;
    }[];
    outputs: {
        name: string;
        type: string;
    }[];
    stateMutability: string;
    selector: string;
}
export interface EventFragment {
    name: string;
    inputs: {
        name: string;
        type: string;
        indexed: boolean;
    }[];
    topic: string;
}
export interface ErrorFragment {
    name: string;
    inputs: {
        name: string;
        type: string;
    }[];
    selector: string;
}
export declare class Interface {
    private _coder;
    private _abiCoder;
    private _abi;
    private _decoder;
    constructor(abi: GhostABIFragment[] | string);
    getFunction(nameOrSelector: string): FunctionFragment;
    getEvent(nameOrTopic: string): EventFragment;
    getError(nameOrSelector: string): ErrorFragment;
    /** Returns the 4-byte selector hex (e.g. "0xabcd1234") for a function name. */
    getSighash(nameOrFragment: string | FunctionFragment): string;
    /** Encode a function call (selector + parameters). */
    encodeFunctionData(nameOrFragment: string, values?: unknown[]): string;
    /** Decode the result bytes from an eth_call into a Result-like array. */
    decodeFunctionResult(nameOrFragment: string, data: BytesLike): ReadonlyArray<unknown>;
    /** Encode constructor arguments. */
    encodeDeploy(values?: unknown[]): string;
    /** Decode a log using the ABI. */
    parseLog(log: GhostLog): {
        name: string;
        signature: string;
        args: Record<string, unknown>;
    } | null;
    /** Decode transaction error data. */
    parseError(data: BytesLike): {
        name: string;
        args: unknown[];
    } | null;
    format(): string[];
    private _findFrag;
}
