export type { BigNumberish, BytesLike, TransactionRequest, TransactionReceipt, ContractTransactionResponse, Log } from "./types";
export { toBigInt, toNumber, toBytes, toHexString } from "./types";
export { Provider, JsonRpcProvider } from "./Provider";
export { AbiCoder } from "./AbiCoder";
export { Interface } from "./Interface";
export type { FunctionFragment, EventFragment, ErrorFragment, JsonFragment } from "./Interface";
export { BaseContract } from "./BaseContract";
export { Contract } from "./Contract";
export { ContractFactory } from "./ContractFactory";
export type { DeployedContract } from "./ContractFactory";
export { TypedDataEncoder } from "./TypedDataEncoder";
export type { TypedDataDomain, TypedDataTypes, TypedDataField } from "./TypedDataEncoder";
export { Wallet } from "./Wallet";
export { checksumAddress as getAddress, isAddress } from "../utils/address";
export declare const ZeroAddress: string;
export declare function toUtf8Bytes(str: string): Uint8Array;
export declare function keccak256(data: Uint8Array | string | number[]): string;
export interface Signer {
    getAddress(): Promise<string>;
    signTypedData(domain: import("./TypedDataEncoder").TypedDataDomain, types: Record<string, import("./TypedDataEncoder").TypedDataField[]>, value: Record<string, any>): Promise<string>;
}
export declare function verifyTypedData(domain: import("./TypedDataEncoder").TypedDataDomain, types: Record<string, import("./TypedDataEncoder").TypedDataField[]>, value: Record<string, any>, signature: string): string;
