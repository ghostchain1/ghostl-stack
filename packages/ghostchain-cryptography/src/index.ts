/**
 * @file index.ts
 * @module @ghostchain/ghostchain-cryptography
 *
 * GhostChain cryptography library.
 * Drop-in replacement for ethereum-cryptography. // brand-enforcer-ignore
 * Zero ethers dependency. Backed by @noble/hashes, @noble/curves, @scure/bip32, @scure/bip39.
 *
 * Sub-path imports (preferred):
 *   import { keccak256 } from "@ghostchain/ghostchain-cryptography/keccak";
 *   import { sha256 }    from "@ghostchain/ghostchain-cryptography/sha256";
 *   import { secp256k1 } from "@ghostchain/ghostchain-cryptography/secp256k1";
 *   import { HDKey }     from "@ghostchain/ghostchain-cryptography/hdkey";
 *   import { generateMnemonic } from "@ghostchain/ghostchain-cryptography/bip39";
 */

// ─── Hash functions ───────────────────────────────────────────────────────────
export { keccak224, keccak256, keccak384, keccak512 } from "./keccak.js";
export { sha256 } from "./sha256.js";
export { sha512 } from "./sha512.js";
export { ripemd160 } from "./ripemd160.js";
export { blake2b } from "./blake2b.js";

// ─── Key derivation ───────────────────────────────────────────────────────────
export { pbkdf2, pbkdf2Sync } from "./pbkdf2.js";
export { scrypt, scryptSync } from "./scrypt.js";
export type { ScryptParams } from "./scrypt.js";

// ─── Elliptic curve ───────────────────────────────────────────────────────────
export { secp256k1 } from "./secp256k1.js";

// ─── Random ───────────────────────────────────────────────────────────────────
export { getRandomBytes, getRandomBytesSync } from "./random.js";

// ─── AES ─────────────────────────────────────────────────────────────────────
export { encrypt, decrypt } from "./aes.js";
export type { AesMode } from "./aes.js";

// ─── HD keys & mnemonics ─────────────────────────────────────────────────────
export { HDKey, HARDENED_OFFSET } from "./hdkey.js";
export {
  generateMnemonic,
  mnemonicToEntropy,
  entropyToMnemonic,
  validateMnemonic,
  mnemonicToSeed,
  mnemonicToSeedSync,
} from "./bip39/index.js";

// ─── Utilities ────────────────────────────────────────────────────────────────
export {
  bytesToHex,
  hexToBytes,
  utf8ToBytes,
  bytesToUtf8,
  concatBytes,
  createView,
  toHex,
  assertBool,
  assertBytes,
  equalsBytes,
  wrapHash,
  crypto,
} from "./utils.js";
