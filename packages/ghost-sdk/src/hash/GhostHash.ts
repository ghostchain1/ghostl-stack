/**
 * GhostHash — branded hashing utilities for GhostChain.
 *
 * All hashing is done natively via @noble/hashes — zero ethers dependency.
 * Covers keccak256, sha256, sha512, solidityKeccak256 (abi-packed), and
 * topic-0 computation for Solidity events.
 */

import { keccak_256 } from "@noble/hashes/sha3";
import { sha256 as noble_sha256 } from "@noble/hashes/sha256";
import { sha512 as noble_sha512 } from "@noble/hashes/sha512";
import type { Hex, GhostAddress } from "../native/types.js";
import { bytesToHex, hexToBytes, utf8ToBytes } from "../native/bytes.js";
import { strip0x, add0x, padHex } from "../native/hex.js";

// ── Branded hash type ─────────────────────────────────────────────────────────

declare const _hashBrand: unique symbol;

/** Opaque branded 32-byte hex hash. */
export type GhostHash = Hex & { readonly [_hashBrand]: "GhostHash" };

function asHash(h: Hex): GhostHash {
  return h as GhostHash;
}

// ── Low-level ─────────────────────────────────────────────────────────────────

/** keccak256 of raw bytes → bytes. */
export function keccak256Raw(data: Uint8Array): Uint8Array {
  return keccak_256(data);
}

/** keccak256 of raw bytes → hex hash. */
export function keccak256(data: Uint8Array): GhostHash {
  return asHash(bytesToHex(keccak_256(data)));
}

/** keccak256 of a 0x-prefixed hex string → hex hash. */
export function keccak256Hex(hex: Hex): GhostHash {
  return keccak256(hexToBytes(hex));
}

/** keccak256 of a UTF-8 string → hex hash. Used for event/function selectors. */
export function keccak256Utf8(text: string): GhostHash {
  return keccak256(utf8ToBytes(text));
}

/** sha256 of raw bytes → hex hash. */
export function sha256(data: Uint8Array): GhostHash {
  return asHash(bytesToHex(noble_sha256(data)));
}

/** sha256 of a hex string → hex hash. */
export function sha256Hex(hex: Hex): GhostHash {
  return sha256(hexToBytes(hex));
}

/** sha512 of raw bytes → hex (64 bytes). */
export function sha512(data: Uint8Array): Hex {
  return bytesToHex(noble_sha512(data));
}

// ── Solidity-compatible ABI packing ──────────────────────────────────────────

type SolidityType =
  | "address"
  | "bool"
  | "bytes32"
  | "bytes"
  | "string"
  | "uint256"
  | "uint128"
  | "uint64"
  | "uint32"
  | "uint8"
  | "int256";

type SolidityValue = string | boolean | bigint | number | Uint8Array;

function packOne(type: SolidityType, value: SolidityValue): Uint8Array {
  if (type === "address") {
    const addr = strip0x(value as string).toLowerCase().padStart(64, "0");
    return hexToBytes(add0x(addr));
  }
  if (type === "bool") {
    const out = new Uint8Array(32);
    out[31] = value ? 1 : 0;
    return out;
  }
  if (type === "bytes32") {
    const b = hexToBytes(padHex(value as Hex, 32));
    return b;
  }
  if (type === "bytes" || type === "string") {
    // Non-padded tight packing (solidityPackedKeccak256 style)
    if (typeof value === "string" && !value.startsWith("0x")) {
      return utf8ToBytes(value);
    }
    return hexToBytes(value as Hex);
  }
  // uint / int variants: pack as 32-byte big-endian
  const n = BigInt(value as string | number | bigint);
  const hex = n >= 0n ? n.toString(16).padStart(64, "0") : twoComplement(n, 32);
  return hexToBytes(add0x(hex));
}

function twoComplement(n: bigint, bytes: number): string {
  const mod = 2n ** BigInt(bytes * 8);
  return ((n % mod) + mod).toString(16).padStart(bytes * 2, "0");
}

/**
 * Equivalent to Solidity's `keccak256(abi.encodePacked(...))`.
 *
 * @example
 * solidityKeccak256(["address","uint256"], [addr, amount])
 */
export function solidityKeccak256(
  types: SolidityType[],
  values: SolidityValue[],
): GhostHash {
  if (types.length !== values.length) {
    throw new Error("GhostHash: types/values length mismatch");
  }
  const parts = types.map((t, i) => packOne(t, values[i]!));
  const totalLen = parts.reduce((acc, p) => acc + p.length, 0);
  const buf = new Uint8Array(totalLen);
  let offset = 0;
  for (const p of parts) {
    buf.set(p, offset);
    offset += p.length;
  }
  return keccak256(buf);
}

// ── Solidity event topic helpers ──────────────────────────────────────────────

/**
 * Compute the topic-0 (event signature hash) for a Solidity event.
 *
 * @example
 * eventTopic("Transfer(address,address,uint256)") // → 0xddf252...
 */
export function eventTopic(signature: string): GhostHash {
  return keccak256Utf8(signature);
}

/**
 * Compute the 4-byte function selector from a function signature.
 *
 * @example
 * functionSelector("transfer(address,uint256)") // → 0xa9059cbb
 */
export function functionSelector(signature: string): Hex {
  return add0x(strip0x(keccak256Utf8(signature)).slice(0, 8));
}

/**
 * Hash that represents a Ghost-branded "empty" hash (keccak256 of empty bytes).
 * Equivalent to Solidity's `keccak256("")`.
 */
export const GHOST_EMPTY_HASH: GhostHash = keccak256(new Uint8Array(0));

/** Zero hash — 32 bytes of zeros. */
export const GHOST_ZERO_HASH: GhostHash = asHash(
  "0x0000000000000000000000000000000000000000000000000000000000000000",
);

// ── Common event topics ───────────────────────────────────────────────────────

export const GHOST_TOPICS = {
  /** ERC-20 Transfer(address indexed from, address indexed to, uint256 value) */
  ERC20_TRANSFER: eventTopic("Transfer(address,address,uint256)"),
  /** ERC-20 / ERC-721 Approval(address indexed owner, address indexed spender, uint256 value) */
  ERC20_APPROVAL: eventTopic("Approval(address,address,uint256)"),
  /** ERC-721 ApprovalForAll */
  ERC721_APPROVAL_FOR_ALL: eventTopic("ApprovalForAll(address,address,bool)"),
  /** ERC-1155 TransferSingle */
  ERC1155_TRANSFER_SINGLE: eventTopic("TransferSingle(address,address,address,uint256,uint256)"),
  /** ERC-1155 TransferBatch */
  ERC1155_TRANSFER_BATCH: eventTopic("TransferBatch(address,address,address,uint256[],uint256[])"),
} as const;
