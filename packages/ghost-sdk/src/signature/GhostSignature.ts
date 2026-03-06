/**
 * GhostSignature — signature utilities for GhostChain.
 *
 * Pure @noble/curves implementation — zero ethers dependency.
 *
 * Covers:
 * – Split and combine 65-byte (r, s, v) signatures
 * – EIP-2098 compact 64-byte signatures
 * – Address recovery from message hash + signature
 * – EIP-191 personal_sign hash computation
 * – Signature verification
 */

import { secp256k1 } from "@noble/curves/secp256k1";
import type { Hex, GhostAddress } from "../native/types.js";
import { hexToBytes, bytesToHex, utf8ToBytes } from "../native/bytes.js";
import { keccak256Raw } from "../hash/GhostHash.js";
import { add0x, strip0x } from "../native/hex.js";
import { toChecksumAddress, normalizeAddress } from "../native/address.js";
import { GhostValidationError } from "../errors/GhostErrors.js";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface GhostSignatureComponents {
  /** 32-byte r component as hex. */
  r: Hex;
  /** 32-byte s component as hex. */
  s: Hex;
  /** Recovery id — 27 or 28 (legacy) or 0 or 1. */
  v: number;
  /** Compact 64-byte signature (EIP-2098). */
  compact: Hex;
  /** Full 65-byte signature (r ++ s ++ v). */
  full: Hex;
}

// ── Hash helpers ──────────────────────────────────────────────────────────────

/**
 * Compute the EIP-191 personal_sign hash for a message.
 * Ghost uses `"\x19Ghost Signed Message:\n"` prefix (compatible tools
 * may expect `"\x19Ethereum Signed Message:\n"` — choose the prefix you need).
 *
 * @param message  Raw bytes or string to hash.
 * @param prefix   `"ghost"` (default) or `"ethereum"` for EIP-191 compatibility.
 */
export function personalSignHash(
  message: string | Uint8Array,
  prefix: "ghost" | "ethereum" = "ghost",
): Hex {
  const msgBytes =
    typeof message === "string" ? utf8ToBytes(message) : message;
  const tag =
    prefix === "ghost"
      ? `\x19Ghost Signed Message:\n${msgBytes.length}`
      : `\x19Ethereum Signed Message:\n${msgBytes.length}`;
  const tagBytes = utf8ToBytes(tag);
  const full = new Uint8Array(tagBytes.length + msgBytes.length);
  full.set(tagBytes, 0);
  full.set(msgBytes, tagBytes.length);
  return add0x(bytesToHex(keccak256Raw(full)));
}

/**
 * Compute the raw 32-byte digest of a UTF-8 string (no prefix).
 */
export function hashMessage(message: string): Hex {
  return add0x(bytesToHex(keccak256Raw(utf8ToBytes(message))));
}

// ── Split / combine ───────────────────────────────────────────────────────────

/**
 * Split a 65-byte hex signature into its r, s, v components.
 * Accepts both `v = 0|1` and `v = 27|28` formats.
 */
export function splitSignature(sig: Hex): GhostSignatureComponents {
  const bytes = hexToBytes(sig);
  if (bytes.length !== 65) {
    throw new GhostValidationError(
      `splitSignature: expected 65 bytes, got ${bytes.length}`,
    );
  }
  const r = add0x(bytesToHex(bytes.slice(0, 32)));
  const s = add0x(bytesToHex(bytes.slice(32, 64)));
  const vRaw = bytes[64]!;
  const v = vRaw >= 27 ? vRaw : vRaw + 27;
  const recovery = v - 27;

  // EIP-2098 compact: s with high bit of recovery encoded in MSB of s
  const sBytes = bytes.slice(32, 64).slice();
  if (recovery === 1) sBytes[0] = sBytes[0]! | 0x80;
  const compact = add0x(bytesToHex(bytes.slice(0, 32)) + bytesToHex(sBytes));

  return { r: r as Hex, s: s as Hex, v, compact: compact as Hex, full: sig };
}

/**
 * Recombine r, s, v components into a 65-byte hex signature.
 */
export function joinSignature(r: Hex, s: Hex, v: number): Hex {
  const recovery = v >= 27 ? v - 27 : v;
  if (recovery !== 0 && recovery !== 1) {
    throw new GhostValidationError(`Invalid v/recovery: ${v}`);
  }
  const rBytes = hexToBytes(r).slice(-32);
  const sBytes = hexToBytes(s).slice(-32);
  const rPad = new Uint8Array(32);
  rPad.set(rBytes, 32 - rBytes.length);
  const sPad = new Uint8Array(32);
  sPad.set(sBytes, 32 - sBytes.length);
  const out = new Uint8Array(65);
  out.set(rPad, 0);
  out.set(sPad, 32);
  out[64] = recovery;
  return add0x(bytesToHex(out)) as Hex;
}

// ── Recovery ──────────────────────────────────────────────────────────────────

/**
 * Recover the signer address from a message hash and a 65-byte signature.
 *
 * @param digest  32-byte message hash (hex).
 * @param sig     65-byte signature (hex).
 */
export function recoverAddress(digest: Hex, sig: Hex): GhostAddress {
  const digestBytes = hexToBytes(digest);
  if (digestBytes.length !== 32) {
    throw new GhostValidationError("digest must be 32 bytes");
  }
  const sigBytes = hexToBytes(sig);
  if (sigBytes.length !== 65) {
    throw new GhostValidationError("sig must be 65 bytes");
  }
  const r = sigBytes.slice(0, 32);
  const s = sigBytes.slice(32, 64);
  const recovery = sigBytes[64]! >= 27 ? sigBytes[64]! - 27 : sigBytes[64]!;

  const compact = new Uint8Array(64);
  compact.set(r, 0);
  compact.set(s, 32);

  const nobleSignature = secp256k1.Signature.fromCompact(
    bytesToHex(compact),
  ).addRecoveryBit(recovery as 0 | 1);

  const publicKey = nobleSignature.recoverPublicKey(digestBytes);
  // Uncompressed 65-byte pubkey → drop 0x04 prefix → keccak256 → last 20 bytes
  const pubUncompressed = publicKey.toRawBytes(false);
  const pubHash = keccak256Raw(pubUncompressed.slice(1));
  return normalizeAddress(add0x(bytesToHex(pubHash.slice(12))));
}

/**
 * Recover the signer address from a personal_sign message and signature.
 *
 * @param message  Original message (string or bytes).
 * @param sig      65-byte signature returned by the wallet.
 * @param prefix   `"ghost"` (default) or `"ethereum"`.
 */
export function recoverPersonalSignAddress(
  message: string | Uint8Array,
  sig: Hex,
  prefix: "ghost" | "ethereum" = "ghost",
): GhostAddress {
  const digest = personalSignHash(message, prefix) as Hex;
  return recoverAddress(digest, sig);
}

// ── Verification ──────────────────────────────────────────────────────────────

/**
 * Verify that a 65-byte signature was created by `expectedSigner` over `digest`.
 */
export function verifySignature(
  digest: Hex,
  sig: Hex,
  expectedSigner: GhostAddress,
): boolean {
  try {
    const recovered = recoverAddress(digest, sig);
    return recovered.toLowerCase() === expectedSigner.toLowerCase();
  } catch {
    return false;
  }
}

/**
 * Verify a personal_sign signature against an expected signer.
 */
export function verifyPersonalSign(
  message: string | Uint8Array,
  sig: Hex,
  expectedSigner: GhostAddress,
  prefix: "ghost" | "ethereum" = "ghost",
): boolean {
  try {
    const recovered = recoverPersonalSignAddress(message, sig, prefix);
    return recovered.toLowerCase() === expectedSigner.toLowerCase();
  } catch {
    return false;
  }
}

// ── EIP-2098 helpers ──────────────────────────────────────────────────────────

/**
 * Expand an EIP-2098 compact 64-byte signature to a full 65-byte signature.
 */
export function compactToFull(compact: Hex): Hex {
  const bytes = hexToBytes(compact);
  if (bytes.length !== 64) {
    throw new GhostValidationError(
      `compactToFull: expected 64 bytes, got ${bytes.length}`,
    );
  }
  const r = bytes.slice(0, 32);
  const sEncoded = bytes.slice(32, 64);
  const recovery = (sEncoded[0]! & 0x80) !== 0 ? 1 : 0;
  const s = sEncoded.slice();
  s[0] = s[0]! & 0x7f;
  const out = new Uint8Array(65);
  out.set(r, 0);
  out.set(s, 32);
  out[64] = recovery;
  return add0x(bytesToHex(out)) as Hex;
}

/**
 * Compress a full 65-byte signature to a 64-byte EIP-2098 compact form.
 */
export function fullToCompact(sig: Hex): Hex {
  const { compact } = splitSignature(sig);
  return compact;
}
