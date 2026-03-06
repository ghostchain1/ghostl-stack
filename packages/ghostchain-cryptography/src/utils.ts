/**
 * @module @ghostchain/ghostchain-cryptography/utils
 *
 * Utility helpers. Drop-in replacement for ethereum-cryptography/utils. // brand-enforcer-ignore
 * Backed by @noble/hashes utilities.
 */
import {
  bytesToHex,
  hexToBytes,
  utf8ToBytes,
  concatBytes,
  createView,
} from "@noble/hashes/utils";
import type { CHash } from "@noble/hashes/utils";

export { bytesToHex, hexToBytes, utf8ToBytes, concatBytes, createView };

/** Alias: toHex is the same as bytesToHex */
export const toHex = bytesToHex;

/** Decode UTF-8 bytes to a string */
export function bytesToUtf8(data: Uint8Array): string {
  return new TextDecoder().decode(data);
}

/** Assert that a value is a boolean */
export function assertBool(b: unknown): asserts b is boolean {
  if (typeof b !== "boolean") {
    throw new Error(`Expected boolean, got ${typeof b}`);
  }
}

/** Assert that a value is a Uint8Array */
export function assertBytes(b: unknown, ...lengths: number[]): asserts b is Uint8Array {
  if (!(b instanceof Uint8Array)) {
    throw new Error("Expected Uint8Array");
  }
  if (lengths.length > 0 && !lengths.includes(b.length)) {
    throw new Error(`Expected Uint8Array of length ${lengths.join(" or ")}, got ${b.length}`);
  }
}

/** Constant-time equality check for two Uint8Arrays */
export function equalsBytes(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

/** Wrap a hash function for use with noble/hashes wrapConstructor pattern */
export function wrapHash(hash: CHash): (data: Uint8Array) => Uint8Array {
  return (data: Uint8Array) => hash(data);
}

/** Web Crypto API (cross-runtime) */
export const crypto: Crypto = globalThis.crypto;
