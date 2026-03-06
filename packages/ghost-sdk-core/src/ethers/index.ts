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

// Address utilities
export { checksumAddress as getAddress, isAddress } from "../utils/address";
export const ZeroAddress = "0x" + "0".repeat(40);

// Encoding utilities
export function toUtf8Bytes(str: string): Uint8Array {
  return new TextEncoder().encode(str);
}

// keccak256 returning 0x-prefixed hex string (matches ethers v6 API)
import { keccak256Hex } from "../crypto/keccak";
export function keccak256(data: Uint8Array | string | number[]): string {
  if (data instanceof Uint8Array) return keccak256Hex(data);
  if (typeof data === "string") {
    return keccak256Hex(Uint8Array.from(Buffer.from(data.replace(/^0x/, ""), "hex")));
  }
  return keccak256Hex(Uint8Array.from(data));
}

// Signer interface (ethers v6-compatible)
export interface Signer {
  getAddress(): Promise<string>;
  signTypedData(
    domain: import("./TypedDataEncoder").TypedDataDomain,
    types: Record<string, import("./TypedDataEncoder").TypedDataField[]>,
    value: Record<string, unknown>
  ): Promise<string>;
}

// verifyTypedData — recovers signer address from an EIP-712 signature
import { Signature } from "@noble/secp256k1";
import { keccak256 as keccak256Raw } from "../crypto/keccak";
import { checksumAddress } from "../utils/address";
import { TypedDataEncoder as _TDE } from "./TypedDataEncoder";
export function verifyTypedData(
  domain: import("./TypedDataEncoder").TypedDataDomain,
  types: Record<string, import("./TypedDataEncoder").TypedDataField[]>,
  value: Record<string, unknown>,
  signature: string
): string {
  const digestHex = _TDE.hash(domain, types, value);
  const digestBytes = Uint8Array.from(Buffer.from(digestHex.replace(/^0x/, ""), "hex"));

  // Parse 65-byte signature (r[32] || s[32] || v[1])
  const sigBytes = Uint8Array.from(Buffer.from(signature.replace(/^0x/, ""), "hex"));
  const compact64 = sigBytes.slice(0, 64);
  const v = sigBytes[64];
  const recovery = v >= 27 ? v - 27 : v;

  const sig = Signature.fromCompact(compact64).addRecoveryBit(recovery);
  const pubKey = sig.recoverPublicKey(digestBytes).toRawBytes(false); // uncompressed 65 bytes
  // GhostChain address = last 20 bytes of keccak256(pubKey[1:])
  const addrHash = keccak256Raw(pubKey.slice(1));
  const addr = "0x" + Buffer.from(addrHash).slice(12).toString("hex");
  return checksumAddress(addr);
}
