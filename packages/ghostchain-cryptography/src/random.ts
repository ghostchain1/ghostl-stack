/**
 * @module @ghostchain/ghostchain-cryptography/random
 *
 * Cryptographically secure random bytes.
 * Drop-in replacement for ethereum-cryptography/random.
 * Backed by @noble/hashes utils.
 */
import { randomBytes } from "@noble/hashes/utils";

/** Synchronously generate `count` random bytes. */
export function getRandomBytesSync(count: number): Uint8Array {
  return randomBytes(count);
}

/** Asynchronously generate `count` random bytes. */
export async function getRandomBytes(count: number): Promise<Uint8Array> {
  return randomBytes(count);
}
