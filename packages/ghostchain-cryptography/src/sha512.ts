/**
 * @module @ghostchain/ghostchain-cryptography/sha512
 *
 * SHA-512 hash. Drop-in replacement for ethereum-cryptography/sha512.
 * Backed by @noble/hashes.
 */
import { sha512 as noble_sha512 } from "@noble/hashes/sha512";

/** SHA-512: returns a 64-byte Uint8Array */
export function sha512(msg: Uint8Array): Uint8Array {
  return noble_sha512(msg);
}
