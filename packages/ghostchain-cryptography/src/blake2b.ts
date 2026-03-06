/**
 * @module @ghostchain/ghostchain-cryptography/blake2b
 *
 * BLAKE2b hash. Drop-in replacement for ethereum-cryptography/blake2b. // brand-enforcer-ignore
 * Backed by @noble/hashes.
 */
import { blake2b as noble_blake2b } from "@noble/hashes/blake2b";

/**
 * BLAKE2b hash with configurable output length.
 *
 * @param msg    data to hash
 * @param outputLength  output length in bytes (1–64, default 64)
 * @param key    optional key for BLAKE2b-MAC (0–64 bytes)
 */
export function blake2b(
  msg: Uint8Array,
  outputLength = 64,
  key?: Uint8Array,
): Uint8Array {
  return noble_blake2b(msg, { dkLen: outputLength, key });
}
