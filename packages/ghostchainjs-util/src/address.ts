/**
 * @file address.ts
 * @module @ghostchain/ghostchain-util/address
 *
 * GhostChain address utilities — EIP-55 checksum, validation, zero address.
 * Zero ethers dependency.
 */

import { keccak256 } from "./hash.js";
import { hexToBytes, bytesToHex } from "./hex.js";
import { GhostAddressError } from "./errors.js";
import type { GhostAddress } from "./types.js";

// ─── Validation ───────────────────────────────────────────────────────────────

const ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/;

/**
 * Returns true if `value` looks like a valid 20-byte hex address (any casing).
 */
export function isAddress(value: string): value is GhostAddress {
  return ADDRESS_RE.test(value);
}

/**
 * Assert that `value` is a valid address; throw GhostAddressError otherwise.
 */
export function assertAddress(value: string, label = "address"): asserts value is GhostAddress {
  if (!isAddress(value))
    throw new GhostAddressError(`${label} is not a valid GhostChain address: "${value}"`);
}

// ─── Checksum (EIP-55) ───────────────────────────────────────────────────────

/**
 * Apply EIP-55 mixed-case checksum to an address.
 * Input can be checksummed, all-lowercase, or all-uppercase.
 */
export function checksumAddress(address: string): GhostAddress {
  if (!isAddress(address))
    throw new GhostAddressError(`checksumAddress: invalid address "${address}"`);
  const lower = address.toLowerCase().slice(2);
  const hashBytes = keccak256(new TextEncoder().encode(lower));
  const hash = bytesToHex(hashBytes).slice(2); // strip 0x
  let result = "0x";
  for (let i = 0; i < lower.length; i++) {
    result += parseInt(hash[i], 16) >= 8 ? lower[i].toUpperCase() : lower[i];
  }
  return result as GhostAddress;
}

/**
 * Returns true if `address` is a valid EIP-55 checksummed address.
 */
export function isChecksumAddress(address: string): boolean {
  try {
    return isAddress(address) && address === checksumAddress(address);
  } catch {
    return false;
  }
}

/**
 * Normalize an address to lowercase 0x-prefixed (no checksum).
 */
export function normalizeAddress(address: string): string {
  assertAddress(address);
  return address.toLowerCase() as GhostAddress;
}

// ─── Zero / Null addresses ───────────────────────────────────────────────────

/**
 * The zero address: `0x0000000000000000000000000000000000000000`
 */
export function zeroAddress(): GhostAddress {
  return ("0x" + "0".repeat(40)) as GhostAddress;
}

/**
 * Returns true if `address` is the zero address (case-insensitive).
 */
export function isZeroAddress(address: string): boolean {
  return isAddress(address) && address.toLowerCase() === zeroAddress();
}

// ─── Address ↔ bytes32 ───────────────────────────────────────────────────────

/**
 * Left-pad a 20-byte address into a 32-byte `bytes32` slot (ABI-encoded).
 */
export function addressToBytes32(address: string): string {
  assertAddress(address);
  return "0x" + "0".repeat(24) + address.slice(2).toLowerCase();
}

/**
 * Extract a 20-byte address from the last 20 bytes of a 32-byte hex value.
 */
export function bytes32ToAddress(bytes32: string): GhostAddress {
  const stripped = bytes32.startsWith("0x") ? bytes32.slice(2) : bytes32;
  if (stripped.length !== 64)
    throw new GhostAddressError(`bytes32ToAddress: expected 32 bytes, got ${stripped.length / 2}`);
  return checksumAddress("0x" + stripped.slice(24));
}

// ─── Address comparison ───────────────────────────────────────────────────────

/**
 * Case-insensitive address equality check.
 */
export function addressEq(a: string, b: string): boolean {
  return a.toLowerCase() === b.toLowerCase();
}

/**
 * Convert a raw 20-byte Uint8Array to a checksummed address string.
 */
export function bytesToAddress(bytes: Uint8Array): GhostAddress {
  if (bytes.length !== 20)
    throw new GhostAddressError(`bytesToAddress: expected 20 bytes, got ${bytes.length}`);
  return checksumAddress("0x" + Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join(""));
}

/**
 * Convert a checksummed address string to a 20-byte Uint8Array.
 */
export function addressToBytes(address: string): Uint8Array {
  assertAddress(address);
  return hexToBytes(address);
}
