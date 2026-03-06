/**
 * @module @ghostchain/ghostchain-cryptography/ripemd160
 *
 * RIPEMD-160 hash. Drop-in replacement for ethereum-cryptography/ripemd160.
 * Backed by @noble/hashes.
 */
import { ripemd160 as noble_ripemd160 } from "@noble/hashes/ripemd160";

/** RIPEMD-160: returns a 20-byte Uint8Array */
export function ripemd160(msg: Uint8Array): Uint8Array {
  return noble_ripemd160(msg);
}
