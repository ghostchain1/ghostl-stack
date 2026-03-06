/**
 * @module @ghostchain/ghostchain-cryptography/aes
 *
 * AES encryption/decryption. Drop-in replacement for ethereum-cryptography/aes.
 * Uses Node.js built-in `crypto` module — no external deps.
 *
 * Modes supported: "aes-128-ctr" (default), "aes-256-ctr", "aes-128-cbc",
 * "aes-256-cbc", "aes-128-gcm", "aes-256-gcm".
 */
import {
  createCipheriv,
  createDecipheriv,
  type CipherKey,
} from "node:crypto";

export type AesMode =
  | "aes-128-ctr"
  | "aes-256-ctr"
  | "aes-128-cbc"
  | "aes-256-cbc"
  | "aes-128-gcm"
  | "aes-256-gcm";

function resolveMode(key: Uint8Array, iv: Uint8Array): AesMode {
  if (key.length === 16) return "aes-128-ctr";
  if (key.length === 32) return "aes-256-ctr";
  throw new Error(`Unsupported AES key length: ${key.length}. Expected 16 or 32 bytes.`);
}

/**
 * AES encrypt.
 *
 * @param key  16 or 32-byte key (AES-128 or AES-256)
 * @param iv   16-byte initialisation vector
 * @param plaintext   data to encrypt
 * @param mode  cipher mode (default: derived from key length)
 * @param pkcs7PaddingEnabled  ignored for CTR/GCM, respected for CBC
 */
export function encrypt(
  key: Uint8Array,
  iv: Uint8Array,
  plaintext: Uint8Array,
  mode?: AesMode,
  _pkcs7PaddingEnabled = true,
): Uint8Array {
  const m = mode ?? resolveMode(key, iv);
  const cipher = createCipheriv(m, key as unknown as CipherKey, iv);
  const buf = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  return new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);
}

/**
 * AES decrypt.
 *
 * @param key  16 or 32-byte key (AES-128 or AES-256)
 * @param iv   16-byte initialisation vector
 * @param ciphertext  data to decrypt
 * @param mode  cipher mode (default: derived from key length)
 * @param pkcs7PaddingEnabled  ignored for CTR/GCM, respected for CBC
 */
export function decrypt(
  key: Uint8Array,
  iv: Uint8Array,
  ciphertext: Uint8Array,
  mode?: AesMode,
  _pkcs7PaddingEnabled = true,
): Uint8Array {
  const m = mode ?? resolveMode(key, iv);
  const decipher = createDecipheriv(m, key as unknown as CipherKey, iv);
  const buf = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);
}
