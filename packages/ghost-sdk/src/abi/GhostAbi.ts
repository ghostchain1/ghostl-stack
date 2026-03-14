/**
 * GhostAbi — standalone ABI encoding/decoding module for GhostChain.
 *
 * Re-exports and extends native/abi.ts with higher-level utilities:
 * – function selectors
 * – typed call encoding
 * – return data decoding
 * – full ABI fragment support
 */

import type { GhostAddress, Hex } from "../native/types.js";
import {
  functionSelector as _selector,
  encodeCall,
} from "../native/abi.js";
import { add0x, strip0x, hexToBigInt } from "../native/hex.js";
import { bytesToHex, hexToBytes } from "../native/bytes.js";
import { GhostAbiError } from "../errors/GhostErrors.js";

// Re-export primitives
export { encodeCall };
export { functionSelector } from "../native/abi.js";

// ── ABI Fragment types ────────────────────────────────────────────────────────

export type AbiParamType =
  | "address"
  | "bool"
  | "bytes"
  | "bytes32"
  | "string"
  | "uint256"
  | "uint128"
  | "uint64"
  | "uint32"
  | "uint8"
  | "int256"
  | "int128"
  | "int64"
  | "int32"
  | "int8";

export interface AbiInput {
  name: string;
  type: AbiParamType | string;
}

export interface AbiOutput {
  name: string;
  type: AbiParamType | string;
}

export interface AbiFunctionFragment {
  type: "function";
  name: string;
  inputs: AbiInput[];
  outputs: AbiOutput[];
  stateMutability?: "view" | "pure" | "nonpayable" | "payable";
}

export interface AbiEventFragment {
  type: "event";
  name: string;
  inputs: Array<AbiInput & { indexed?: boolean }>;
  anonymous?: boolean;
}

export type AbiFragment = AbiFunctionFragment | AbiEventFragment;

// ── Selector helpers ──────────────────────────────────────────────────────────

/**
 * Build a function signature string from an ABI fragment.
 * e.g. `{ name: "transfer", inputs: [{type:"address"},{type:"uint256"}] }`
 *      → `"transfer(address,uint256)"`
 */
export function abiSignature(fragment: AbiFunctionFragment | AbiEventFragment): string {
  const types = fragment.inputs.map((i) => i.type).join(",");
  return `${fragment.name}(${types})`;
}

/**
 * Get the 4-byte selector for a function fragment.
 */
export function fragmentSelector(fragment: AbiFunctionFragment): Hex {
  return _selector(abiSignature(fragment));
}

// ── Return data decoding ──────────────────────────────────────────────────────

type DecodedValue = bigint | boolean | string | GhostAddress | Hex;

/**
 * Decode a single 32-byte word from ABI-encoded return data at `offset`.
 */
function decodeWord(data: Uint8Array, offset: number, type: AbiParamType): DecodedValue {
  const word = data.slice(offset, offset + 32);
  const wordHex = add0x(bytesToHex(word).replace("0x", ""));

  if (type === "bool") {
    return word[31] === 1;
  }
  if (type.startsWith("uint") || type.startsWith("int")) {
    return hexToBigInt(wordHex);
  }
  if (type === "address") {
    return add0x(bytesToHex(word).slice(-40)) as GhostAddress;
  }
  if (type === "bytes32") {
    return wordHex;
  }
  // Dynamic types handled by pointer
  return hexToBigInt(wordHex);
}

/**
 * Decode ABI-encoded return data (eth_call result) into typed values.
 *
 * Supports static types: address, bool, uint256, bytes32, int256.
 * Dynamic types (bytes, string, arrays) are returned as raw hex offsets.
 *
 * @example
 * const [balance] = decodeReturnData("0x0000...00de0b", ["uint256"]);
 */
export function decodeReturnData(
  data: Hex,
  outputTypes: AbiParamType[],
): DecodedValue[] {
  const bytes = hexToBytes(data);
  if (bytes.length < outputTypes.length * 32) {
    throw new GhostAbiError(
      `Return data too short: expected ${outputTypes.length * 32} bytes, got ${bytes.length}`,
    );
  }

  const results: DecodedValue[] = [];
  for (let i = 0; i < outputTypes.length; i++) {
    const type = outputTypes[i]!;
    const offset = i * 32;
    if (type === "bytes" || type === "string") {
      // Read pointer, then decode from offset
      const ptr = Number(hexToBigInt(add0x(bytesToHex(bytes.slice(offset, offset + 32)))));
      const len = Number(hexToBigInt(add0x(bytesToHex(bytes.slice(ptr, ptr + 32)))));
      const raw = bytes.slice(ptr + 32, ptr + 32 + len);
      results.push(
        type === "string"
          ? new TextDecoder().decode(raw)
          : (add0x(bytesToHex(raw)) as Hex),
      );
    } else {
      results.push(decodeWord(bytes, offset, type));
    }
  }
  return results;
}

/**
 * Decode a single `uint256` return value from ABI-encoded data.
 */
export function decodeUint256(data: Hex): bigint {
  return decodeReturnData(data, ["uint256"])[0] as bigint;
}

/**
 * Decode a single `address` return value from ABI-encoded data.
 */
export function decodeAddress(data: Hex): GhostAddress {
  return decodeReturnData(data, ["address"])[0] as GhostAddress;
}

/**
 * Decode a single `bool` return value from ABI-encoded data.
 */
export function decodeBool(data: Hex): boolean {
  return decodeReturnData(data, ["bool"])[0] as boolean;
}

/**
 * Decode a single `string` return value from ABI-encoded data.
 */
export function decodeString(data: Hex): string {
  return decodeReturnData(data, ["string"])[0] as string;
}

// ── Quick-call calldata builders ──────────────────────────────────────────────

/** Encode `balanceOf(address)` calldata. */
export function encodeBalanceOf(account: GhostAddress): Hex {
  return encodeCall("balanceOf(address)", ["address"], [account]);
}

/** Encode `transfer(address,uint256)` calldata. */
export function encodeTransfer(to: GhostAddress, amount: bigint): Hex {
  return encodeCall("transfer(address,uint256)", ["address", "uint256"], [to, amount]);
}

/** Encode `approve(address,uint256)` calldata. */
export function encodeApprove(spender: GhostAddress, amount: bigint): Hex {
  return encodeCall("approve(address,uint256)", ["address", "uint256"], [spender, amount]);
}

/** Encode `allowance(address,address)` calldata. */
export function encodeAllowance(owner: GhostAddress, spender: GhostAddress): Hex {
  return encodeCall("allowance(address,address)", ["address", "address"], [owner, spender]);
}

/** Encode `totalSupply()` calldata. */
export function encodeTotalSupply(): Hex {
  return add0x(strip0x(_selector("totalSupply()")));
}

/** Encode `decimals()` calldata. */
export function encodeDecimals(): Hex {
  return add0x(strip0x(_selector("decimals()")));
}

/** Encode `symbol()` calldata. */
export function encodeSymbol(): Hex {
  return add0x(strip0x(_selector("symbol()")));
}

/** Encode `name()` calldata. */
export function encodeName(): Hex {
  return add0x(strip0x(_selector("name()")));
}
