/**
 * @module @ghostchain/ghostchain-cryptography/pbkdf2
 *
 * PBKDF2 key derivation. Drop-in replacement for ethereum-cryptography/pbkdf2.
 * Backed by @noble/hashes.
 */
import { pbkdf2 as noble_pbkdf2, pbkdf2Async as noble_pbkdf2Async } from "@noble/hashes/pbkdf2";
import { sha256 } from "@noble/hashes/sha256";
import type { CHash } from "@noble/hashes/utils";

/**
 * Synchronous PBKDF2.
 *
 * @param password   password bytes
 * @param salt       salt bytes
 * @param iterations number of iterations
 * @param keyLength  output key length in bytes
 * @param algorithm  hash algorithm (default: sha256)
 */
export function pbkdf2Sync(
  password: Uint8Array,
  salt: Uint8Array,
  iterations: number,
  keyLength: number,
  algorithm: CHash = sha256,
): Uint8Array {
  return noble_pbkdf2(algorithm, password, salt, { c: iterations, dkLen: keyLength });
}

/**
 * Asynchronous PBKDF2.
 */
export async function pbkdf2(
  password: Uint8Array,
  salt: Uint8Array,
  iterations: number,
  keyLength: number,
  algorithm: CHash = sha256,
): Promise<Uint8Array> {
  return noble_pbkdf2Async(algorithm, password, salt, { c: iterations, dkLen: keyLength });
}
