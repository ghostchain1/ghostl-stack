/**
 * @file hash.ts
 * @module @ghostchain/ghostchain-util/hash
 *
 * Cryptographic hash functions for GhostChain.
 * Uses @noble/hashes — audited, zero-dependency pure-JS implementations.
 */

import { keccak_256 } from "@noble/hashes/sha3";
import { sha256 as noble_sha256 } from "@noble/hashes/sha256";
import { sha512 as noble_sha512 } from "@noble/hashes/sha512";
import { ripemd160 as noble_ripemd160 } from "@noble/hashes/ripemd160";
import { hexToBytes, bytesToHex } from "./hex.js";

// ─── Input normalization ─────────────────────────────────────────────────────

function _toBytes(input: Uint8Array | string): Uint8Array {
  if (typeof input === "string") {
    // If hex, decode to bytes; otherwise UTF-8 encode
    return input.startsWith("0x") ? hexToBytes(input) : new TextEncoder().encode(input);
  }
  return input;
}

// ─── Keccak-256 ──────────────────────────────────────────────────────────────

/**
 * Compute keccak-256 of `data`. Returns raw Uint8Array.
 * Accepts raw bytes, a 0x-prefixed hex string, or a UTF-8 string.
 */
export function keccak256(data: Uint8Array | string): Uint8Array {
  return keccak_256(_toBytes(data));
}

/**
 * Compute keccak-256 of `data`. Returns a 0x-prefixed hex string.
 */
export function keccak256Hex(data: Uint8Array | string): string {
  return bytesToHex(keccak_256(_toBytes(data)));
}

/**
 * Compute the keccak-256 of a UTF-8 string (used for event topic / function selector).
 */
export function keccak256Text(text: string): string {
  return bytesToHex(keccak_256(new TextEncoder().encode(text)));
}

// ─── SHA-256 ─────────────────────────────────────────────────────────────────

/**
 * Compute SHA-256 of `data`. Returns raw Uint8Array.
 */
export function sha256(data: Uint8Array | string): Uint8Array {
  return noble_sha256(_toBytes(data));
}

/**
 * Compute SHA-256 of `data`. Returns a 0x-prefixed hex string.
 */
export function sha256Hex(data: Uint8Array | string): string {
  return bytesToHex(noble_sha256(_toBytes(data)));
}

// ─── SHA-512 ─────────────────────────────────────────────────────────────────

/**
 * Compute SHA-512 of `data`. Returns raw Uint8Array.
 */
export function sha512(data: Uint8Array | string): Uint8Array {
  return noble_sha512(_toBytes(data));
}

// ─── RIPEMD-160 ──────────────────────────────────────────────────────────────

/**
 * Compute RIPEMD-160 of `data`. Returns raw Uint8Array.
 */
export function ripemd160(data: Uint8Array | string): Uint8Array {
  return noble_ripemd160(_toBytes(data));
}

// ─── Hash160 (BTC-style: SHA256 then RIPEMD160) ───────────────────────────────

/**
 * hash160 = RIPEMD160(SHA256(data)). Used for P2PKH-style addresses.
 */
export function hash160(data: Uint8Array | string): Uint8Array {
  return noble_ripemd160(noble_sha256(_toBytes(data)));
}

// ─── Function selector ───────────────────────────────────────────────────────

/**
 * Compute the 4-byte ABI function selector for a signature string.
 * @example functionSelector("transfer(address,uint256)") → "0xa9059cbb"
 */
export function functionSelector(signature: string): string {
  const hash = keccak_256(new TextEncoder().encode(signature));
  return bytesToHex(hash.slice(0, 4));
}

/**
 * Compute the 32-byte event topic for an event signature string.
 * @example eventTopic("Transfer(address,address,uint256)") → "0xddf2..."
 */
export function eventTopic(signature: string): string {
  return bytesToHex(keccak_256(new TextEncoder().encode(signature)));
}
