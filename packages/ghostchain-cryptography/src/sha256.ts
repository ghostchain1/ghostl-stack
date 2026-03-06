/**
 * @module @ghostchain/ghostchain-cryptography/sha256
 *
 * SHA-256 hash. Drop-in replacement for ethereum-cryptography/sha256. // brand-enforcer-ignore
 * Backed by @noble/hashes.
 */
import { sha256 as noble_sha256 } from "@noble/hashes/sha256";

/** SHA-256: returns a 32-byte Uint8Array */
export function sha256(msg: Uint8Array): Uint8Array {
  return noble_sha256(msg);
}
