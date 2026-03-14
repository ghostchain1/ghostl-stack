/**
 * @file hex.ts
 * @module @ghostchain/ghostchain-util/hex
 *
 * Hex ↔ bytes ↔ bigint conversion utilities for GhostChain.
 * Zero dependencies — pure native TypeScript.
 */

import { GhostHexError } from "./errors.js";

// ─── Guards & Normalization ───────────────────────────────────────────────────

/**
 * Returns true if `value` is a valid 0x-prefixed hex string.
 * An empty hex string ("0x") is considered valid.
 */
export function isHex(value: string): boolean {
  return /^0x[0-9a-fA-F]*$/.test(value);
}

/**
 * Assert that `hex` is a valid hex string; throw GhostHexError otherwise.
 */
export function assertHex(hex: string, label = "value"): void {
  if (!isHex(hex)) throw new GhostHexError(`${label} is not a valid hex string: "${hex}"`);
}

/**
 * Strip the "0x" prefix if present.
 */
export function stripHexPrefix(hex: string): string {
  return hex.startsWith("0x") ? hex.slice(2) : hex;
}

/**
 * Add the "0x" prefix if not already present.
 */
export function addHexPrefix(hex: string): string {
  return hex.startsWith("0x") ? hex : "0x" + hex;
}

// ─── Number → Hex ────────────────────────────────────────────────────────────

/**
 * Convert a bigint or number to a 0x-prefixed hex string (no zero-padding).
 * @example toHex(255n) → "0xff"
 */
export function toHex(value: bigint | number): string {
  const n = BigInt(value);
  if (n < 0n) throw new GhostHexError(`toHex: negative value ${n}`);
  return "0x" + n.toString(16);
}

/**
 * Convert a bigint/number to a 0x-prefixed hex string, left-padded to `bytes` bytes.
 * @example toHexPadded(1n, 32) → "0x0000...0001"
 */
export function toHexPadded(value: bigint | number, bytes: number): string {
  const n = BigInt(value);
  if (n < 0n) throw new GhostHexError(`toHexPadded: negative value ${n}`);
  return "0x" + n.toString(16).padStart(bytes * 2, "0");
}

// ─── Hex → Number ────────────────────────────────────────────────────────────

/**
 * Parse a 0x-prefixed hex string into a bigint.
 */
export function fromHex(hex: string): bigint {
  const stripped = stripHexPrefix(hex);
  if (stripped === "") return 0n;
  if (!/^[0-9a-fA-F]+$/.test(stripped))
    throw new GhostHexError(`fromHex: invalid hex characters in "${hex}"`);
  return BigInt("0x" + stripped);
}

/**
 * Parse a 0x-prefixed hex string into a number.
 * Throws if the value exceeds Number.MAX_SAFE_INTEGER.
 */
export function fromHexNumber(hex: string): number {
  const n = fromHex(hex);
  if (n > BigInt(Number.MAX_SAFE_INTEGER))
    throw new GhostHexError(`fromHexNumber: value exceeds MAX_SAFE_INTEGER: ${n}`);
  return Number(n);
}

// ─── Hex ↔ Bytes ─────────────────────────────────────────────────────────────

/**
 * Convert a 0x-prefixed hex string to a Uint8Array.
 */
export function hexToBytes(hex: string): Uint8Array {
  const stripped = stripHexPrefix(hex);
  if (stripped === "") return new Uint8Array(0);
  const padded = stripped.length % 2 === 0 ? stripped : "0" + stripped;
  if (!/^[0-9a-fA-F]+$/.test(padded))
    throw new GhostHexError(`hexToBytes: invalid hex string "${hex}"`);
  const arr = new Uint8Array(padded.length / 2);
  for (let i = 0; i < arr.length; i++) {
    arr[i] = parseInt(padded.slice(i * 2, i * 2 + 2), 16);
  }
  return arr;
}

/**
 * Convert a Uint8Array to a 0x-prefixed lowercase hex string.
 */
export function bytesToHex(bytes: Uint8Array): string {
  return "0x" + Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

// ─── Hex ↔ String ─────────────────────────────────────────────────────────────

/**
 * UTF-8 encode a string to a 0x-prefixed hex string.
 */
export function stringToHex(str: string): string {
  return bytesToHex(new TextEncoder().encode(str));
}

/**
 * UTF-8 decode a 0x-prefixed hex string back to a string.
 */
export function hexToString(hex: string): string {
  return new TextDecoder().decode(hexToBytes(hex));
}

// ─── Padding helpers ─────────────────────────────────────────────────────────

/**
 * Left-pad a hex string (with or without 0x prefix) to `totalBytes` bytes.
 * Returns a lowercase 0x-prefixed string.
 */
export function padLeft(hex: string, totalBytes: number): string {
  const stripped = stripHexPrefix(hex);
  return "0x" + stripped.padStart(totalBytes * 2, "0");
}

/**
 * Right-pad a hex string to `totalBytes` bytes (adds trailing zero bytes).
 * Returns a lowercase 0x-prefixed string.
 */
export function padRight(hex: string, totalBytes: number): string {
  const stripped = stripHexPrefix(hex);
  return "0x" + stripped.padEnd(totalBytes * 2, "0");
}

/**
 * Concatenate two 0x-prefixed hex strings.
 */
export function hexConcat(...parts: string[]): string {
  return "0x" + parts.map(stripHexPrefix).join("");
}

/**
 * Slice a 0x-prefixed hex string by byte offset (inclusive start, exclusive end).
 */
export function hexSlice(hex: string, startByte: number, endByte?: number): string {
  const stripped = stripHexPrefix(hex);
  const s = startByte * 2;
  const e = endByte !== undefined ? endByte * 2 : stripped.length;
  return "0x" + stripped.slice(s, e);
}
