// ─────────────────────────────────────────────────────────────────────────────
// @ghostchain/ghost-sdk-core – ethers compatibility layer
//
// Drop-in replacements for the most common ethers.js v6 exports:
//
//   import {
//     ContractFactory, BaseContract, Contract,
//     AbiCoder, Interface,
//     JsonRpcProvider, Provider,
//     TransactionReceipt, TransactionRequest, ContractTransactionResponse,
//     TypedDataEncoder,
//     Wallet,
//     BigNumberish, BytesLike
//   } from "@ghostchain/ghost-sdk-core/ethers";
//
// or from the root barrel:
//   import { ... } from "@ghostchain/ghost-sdk-core";
// ─────────────────────────────────────────────────────────────────────────────

// Primitive types
export type { BigNumberish, BytesLike, TransactionRequest, TransactionReceipt, ContractTransactionResponse, Log } from "./types";
export { toBigInt, toNumber, toBytes, toHexString } from "./types";

// Provider
export { Provider, JsonRpcProvider } from "./Provider";

// ABI
export { AbiCoder }        from "./AbiCoder";
export { Interface }       from "./Interface";
export type { FunctionFragment, EventFragment, ErrorFragment, JsonFragment } from "./Interface";

// Contract
export { BaseContract }    from "./BaseContract";
export { Contract }        from "./Contract";
export { ContractFactory } from "./ContractFactory";
export type { DeployedContract } from "./ContractFactory";

// Signing
export { TypedDataEncoder } from "./TypedDataEncoder";
export type { TypedDataDomain, TypedDataTypes, TypedDataField } from "./TypedDataEncoder";
export { Wallet } from "./Wallet";
