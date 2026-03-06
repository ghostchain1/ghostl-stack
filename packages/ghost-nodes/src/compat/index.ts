/**
 * @file compat/index.ts
 * @module @ghostchain/ghost-nodes/compat
 *
 * Ghost-branded aliases for the ethers compatibility layer from ghost-sdk-core.
 *
 * Consumers import Ghost-prefixed names — no "ethers", "Provider", "Wallet",
 * etc. leak into product code.
 *
 * @brand-enforcer-ignore — designated compat barrel; eth* names are intentional.
 *
 * Usage:
 *   import { GhostJsonRpcProvider } from "@ghostchain/ghost-nodes/compat";
 */

// Primitive helpers and types
export {
  toBigInt, toNumber, toBytes, toHexString,
} from "@ghostchain/ghost-sdk-core";

export type {
  BigNumberish        as GhostBigNumberish,
  BytesLike           as GhostBytesLike,
  TransactionRequest  as GhostTransactionRequest,
  TransactionReceipt  as GhostTransactionReceipt,
} from "@ghostchain/ghost-sdk-core";

// Provider
export {
  Provider        as GhostCompatProvider,
  JsonRpcProvider as GhostJsonRpcProvider,
} from "@ghostchain/ghost-sdk-core";

// Signer / Wallet
export { Wallet as GhostCompatWallet } from "@ghostchain/ghost-sdk-core";

// Contracts
export {
  BaseContract    as GhostBaseContract,
  Contract        as GhostCompatContract,
  ContractFactory as GhostCompatContractFactory,
} from "@ghostchain/ghost-sdk-core";

export type {
  DeployedContract as GhostDeployedContract,
} from "@ghostchain/ghost-sdk-core";

// ABI
export { AbiCoder  as GhostCompatAbiCoder }  from "@ghostchain/ghost-sdk-core";
export { Interface as GhostCompatInterface }  from "@ghostchain/ghost-sdk-core";

export type {
  FunctionFragment, EventFragment, ErrorFragment, JsonFragment,
} from "@ghostchain/ghost-sdk-core";

// Typed-data signing
export {
  TypedDataEncoder as GhostCompatTypedDataEncoder,
} from "@ghostchain/ghost-sdk-core";

export type {
  TypedDataDomain as GhostTypedDataDomain,
  TypedDataTypes  as GhostTypedDataTypes,
  TypedDataField  as GhostTypedDataField,
} from "@ghostchain/ghost-sdk-core";

// Already-branded wrappers from ghost-sdk-core
export { GhostProvider, GhostWallet, GhostContract } from "@ghostchain/ghost-sdk-core";
