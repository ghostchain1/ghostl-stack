/**
 * @module @ghostchain/ghostchain-cryptography/keccak
 *
 * Keccak hash functions. Drop-in replacement for ethereum-cryptography/keccak. // brand-enforcer-ignore
 * Backed by @noble/hashes.
 */
import { keccak_224, keccak_256, keccak_384, keccak_512 } from "@noble/hashes/sha3";

export type { Input } from "@noble/hashes/utils";

/** Keccak-224: returns a 28-byte Uint8Array */
export function keccak224(msg: Uint8Array): Uint8Array {
  return keccak_224(msg);
}

/** Keccak-256: the workhorse hash for GhostChain/GhostChain. Returns 32 bytes. */
export function keccak256(msg: Uint8Array): Uint8Array {
  return keccak_256(msg);
}

/** Keccak-384: returns a 48-byte Uint8Array */
export function keccak384(msg: Uint8Array): Uint8Array {
  return keccak_384(msg);
}

/** Keccak-512: returns a 64-byte Uint8Array */
export function keccak512(msg: Uint8Array): Uint8Array {
  return keccak_512(msg);
}
