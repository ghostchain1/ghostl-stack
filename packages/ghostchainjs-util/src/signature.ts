/**
 * @file signature.ts
 * @module @ghostchain/ghostchainjs-util/signature
 *
 * secp256k1 signing, signature parsing, and address recovery for GhostChain.
 * Uses @noble/secp256k1 v2 — audited, zero-dependency pure JS.
 *
 * NOTE: Private keys are never logged. Handle all key material with care.
 */

import { secp256k1 } from "@noble/curves/secp256k1";
const secpSign = secp256k1.sign;
const secpGetPublicKey = secp256k1.getPublicKey;
const SecpSignature = secp256k1.Signature;
import { keccak256 } from "./hash.js";
import { hexToBytes, bytesToHex } from "./hex.js";
import { checksumAddress } from "./address.js";
import { GhostSignatureError } from "./errors.js";
import type { GhostSignature } from "./types.js";

// ─── Personal-sign prefix (EIP-191 §v 0x45) ─────────────────────────────────

const PERSONAL_SIGN_PREFIX = "\x19GhostChain Signed Message:\n";

/**
 * Hash a message with the EIP-191 personal_sign prefix.
 * GhostChain uses the same prefix for wallet compatibility.
 */
export function hashPersonalMessage(message: string | Uint8Array): Uint8Array {
  const msgBytes = typeof message === "string"
    ? new TextEncoder().encode(message)
    : message;
  const prefixStr = PERSONAL_SIGN_PREFIX + msgBytes.length.toString();
  const prefixBytes = new TextEncoder().encode(prefixStr);
  const combined = new Uint8Array(prefixBytes.length + msgBytes.length);
  combined.set(prefixBytes, 0);
  combined.set(msgBytes, prefixBytes.length);
  return keccak256(combined);
}

// ─── Signing ─────────────────────────────────────────────────────────────────

/**
 * Sign a 32-byte hash with a secp256k1 private key.
 * Returns a GhostSignature with r, s, v, compact, and full fields.
 *
 * @param hash       32-byte message hash (Uint8Array or 0x-hex)
 * @param privateKey Raw 32-byte private key (Uint8Array or 0x-hex)
 */
export function signHash(
  hash: Uint8Array | string,
  privateKey: Uint8Array | string,
): GhostSignature {
  const hashBytes = typeof hash === "string" ? hexToBytes(hash) : hash;
  const keyBytes  = typeof privateKey === "string" ? hexToBytes(privateKey) : privateKey;

  if (hashBytes.length !== 32)
    throw new GhostSignatureError(`signHash: hash must be 32 bytes, got ${hashBytes.length}`);
  if (keyBytes.length !== 32)
    throw new GhostSignatureError(`signHash: private key must be 32 bytes, got ${keyBytes.length}`);

  const sig = secpSign(hashBytes, keyBytes, { lowS: true });
  const r = "0x" + sig.r.toString(16).padStart(64, "0");
  const s = "0x" + sig.s.toString(16).padStart(64, "0");
  const recovery = sig.recovery ?? 0;
  const v = 27 + recovery;
  const compact = r + s.slice(2);
  const full = compact + (recovery === 0 ? "1b" : "1c");

  return { r, s, v, compact, full };
}

/**
 * Sign a string/bytes message with EIP-191 personal_sign prefix.
 */
export function signMessage(
  message: string | Uint8Array,
  privateKey: Uint8Array | string,
): GhostSignature {
  return signHash(hashPersonalMessage(message), privateKey);
}

// ─── Recovery ────────────────────────────────────────────────────────────────

/**
 * Recover the signer address from a 32-byte hash and a signature.
 *
 * @param hash 32-byte hash (Uint8Array or 0x-hex)
 * @param sig  GhostSignature OR a 65-byte 0x-hex string (r+s+v)
 */
export function recoverAddress(
  hash: Uint8Array | string,
  sig: GhostSignature | string,
): string {
  const hashBytes = typeof hash === "string" ? hexToBytes(hash) : hash;
  if (hashBytes.length !== 32)
    throw new GhostSignatureError("recoverAddress: hash must be 32 bytes");

  let r: bigint, s: bigint, recovery: 0 | 1;

  if (typeof sig === "string") {
    const stripped = sig.startsWith("0x") ? sig.slice(2) : sig;
    if (stripped.length !== 130)
      throw new GhostSignatureError("recoverAddress: signature must be 65 bytes (130 hex chars)");
    r = BigInt("0x" + stripped.slice(0, 64));
    s = BigInt("0x" + stripped.slice(64, 128));
    const vByte = parseInt(stripped.slice(128, 130), 16);
    recovery = (vByte === 0x1b || vByte === 27) ? 0 : 1;
  } else {
    r = BigInt(sig.r);
    s = BigInt(sig.s);
    recovery = sig.v === 27 ? 0 : 1;
  }

  const signature = new SecpSignature(r, s).addRecoveryBit(recovery);
  const publicKey = signature.recoverPublicKey(hashBytes);
  // uncompressed public key = 65 bytes (0x04 prefix + 32 byte X + 32 byte Y)
  const pubKeyBytes = publicKey.toRawBytes(false).slice(1); // drop 0x04
  const addrHash = keccak256(pubKeyBytes);
  return checksumAddress("0x" + bytesToHex(addrHash.slice(12)));
}

/**
 * Recover the signer address from a personal_sign message and signature.
 */
export function recoverPersonalMessage(
  message: string | Uint8Array,
  sig: GhostSignature | string,
): string {
  return recoverAddress(hashPersonalMessage(message), sig);
}

// ─── Verification ─────────────────────────────────────────────────────────────

/**
 * Verify a raw hash signature against an expected address.
 */
export function verifySignature(
  hash: Uint8Array | string,
  sig: GhostSignature | string,
  expectedAddress: string,
): boolean {
  try {
    return recoverAddress(hash, sig).toLowerCase() === expectedAddress.toLowerCase();
  } catch {
    return false;
  }
}

/**
 * Verify a personal_sign message signature against an expected address.
 */
export function verifyPersonalMessage(
  message: string | Uint8Array,
  sig: GhostSignature | string,
  expectedAddress: string,
): boolean {
  return verifySignature(hashPersonalMessage(message), sig, expectedAddress);
}

// ─── Key utilities ────────────────────────────────────────────────────────────

/**
 * Derive the GhostChain (checksummed) address from a raw 32-byte private key.
 */
export function privateKeyToAddress(privateKey: Uint8Array | string): string {
  const keyBytes = typeof privateKey === "string" ? hexToBytes(privateKey) : privateKey;
  if (keyBytes.length !== 32)
    throw new GhostSignatureError("privateKeyToAddress: key must be 32 bytes");
  // uncompressed public key (65 bytes)
  const pubKey = secpGetPublicKey(keyBytes, false);
  const pubKeyBody = pubKey.slice(1); // drop 0x04 prefix → 64 bytes
  const addrHash = keccak256(pubKeyBody);
  return checksumAddress("0x" + bytesToHex(addrHash.slice(12)));
}

/**
 * Derive the compressed (33-byte) secp256k1 public key from a private key.
 * Returns a 0x-prefixed hex string.
 */
export function privateKeyToPublicKey(privateKey: Uint8Array | string): string {
  const keyBytes = typeof privateKey === "string" ? hexToBytes(privateKey) : privateKey;
  if (keyBytes.length !== 32)
    throw new GhostSignatureError("privateKeyToPublicKey: key must be 32 bytes");
  return bytesToHex(secpGetPublicKey(keyBytes, true));
}
