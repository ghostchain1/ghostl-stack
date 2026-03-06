/**
 * @module @ghostchain/ghostchain-cryptography/scrypt
 *
 * scrypt key derivation. Drop-in replacement for ethereum-cryptography/scrypt. // brand-enforcer-ignore
 * Backed by @noble/hashes.
 */
import { scrypt as noble_scrypt, scryptAsync as noble_scryptAsync } from "@noble/hashes/scrypt";

export interface ScryptParams {
  N: number;   // CPU/memory cost parameter (must be power of 2)
  r: number;   // block size
  p: number;   // parallelisation
  dkLen: number; // output key length in bytes
}

/**
 * Synchronous scrypt.
 *
 * @param password  password bytes
 * @param salt      salt bytes
 * @param params    scrypt parameters: N, r, p, dkLen
 */
export function scryptSync(
  password: Uint8Array,
  salt: Uint8Array,
  params: ScryptParams,
): Uint8Array {
  return noble_scrypt(password, salt, params);
}

/**
 * Asynchronous scrypt.
 */
export async function scrypt(
  password: Uint8Array,
  salt: Uint8Array,
  params: ScryptParams,
): Promise<Uint8Array> {
  return noble_scryptAsync(password, salt, params);
}
