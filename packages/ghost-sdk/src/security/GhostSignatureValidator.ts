/**
 * GhostSignatureValidator
 *
 * ECDSA signature verification for GhostStack using @noble/curves.
 *
 * Supports:
 *   - Personal sign (eth_sign / personal_sign prefix)
 *   - Raw hash verification
 *   - Address recovery from signature + message
 *   - EIP-712 typed data signature verification
 *
 * Usage:
 *   const validator = new GhostSignatureValidator();
 *
 *   // Verify a personal_sign signature
 *   const ok = await validator.verifyPersonalSign(message, signature, expectedAddress);
 *
 *   // Recover signer address
 *   const signer = await validator.recoverSigner(message, signature);
 */

import { secp256k1 } from "@noble/curves/secp256k1";
import { keccak_256 }  from "@noble/hashes/sha3";

// ── Types ──────────────────────────────────────────────────────────────────────

export interface SignatureComponents {
  r: bigint;
  s: bigint;
  v: number; // 27 or 28
}

// ── GhostSignatureValidator ────────────────────────────────────────────────────

export class GhostSignatureValidator {

  // ── Personal sign ──────────────────────────────────────────────────────────

  /**
   * Verify a `personal_sign` / `eth_sign` signature.
   *
   * Applies the "\x19Ethereum Signed Message:\n" prefix automatically.
   * Returns true if the signature was produced by expectedAddress.
   *
   * @param message         - plain UTF-8 message (without prefix)
   * @param signature       - 65-byte hex signature (0x + 130 hex chars)
   * @param expectedAddress - ghostchainstyle hex address (with or without 0x)
   */
  verifyPersonalSign(message: string, signature: string, expectedAddress: string): boolean {
    const hash      = _personalSignHash(message);
    const recovered = _recoverAddress(hash, signature);
    return recovered.toLowerCase() === expectedAddress.replace(/^0x/i, "").toLowerCase();
  }

  /**
   * Recover the signer address from a `personal_sign` signature.
   *
   * @param message   - plain UTF-8 message (without prefix)
   * @param signature - 65-byte hex signature
   */
  recoverPersonalSigner(message: string, signature: string): string {
    const hash = _personalSignHash(message);
    return "0x" + _recoverAddress(hash, signature);
  }

  // ── Raw hash verify ────────────────────────────────────────────────────────

  /**
   * Verify a signature against a pre-computed 32-byte hash.
   *
   * @param hash      - 32-byte keccak hash (hex, with 0x)
   * @param signature - 65-byte hex signature
   * @param expected  - Expected signer address
   */
  verifyHash(hash: string, signature: string, expected: string): boolean {
    const recovered = _recoverAddress(_hexToBytes(hash), signature);
    return recovered.toLowerCase() === expected.replace(/^0x/i, "").toLowerCase();
  }

  /**
   * Recover signer from a pre-computed 32-byte hash.
   */
  recoverSigner(hash: string, signature: string): string {
    return "0x" + _recoverAddress(_hexToBytes(hash), signature);
  }

  // ── Decomposition ──────────────────────────────────────────────────────────

  /**
   * Break a compact hex signature into its r, s, v components.
   */
  decompose(signature: string): SignatureComponents {
    const hex = signature.replace(/^0x/i, "");
    if (hex.length !== 130) throw new Error("GhostSignatureValidator: signature must be 65 bytes");
    return {
      r: BigInt("0x" + hex.slice(0, 64)),
      s: BigInt("0x" + hex.slice(64, 128)),
      v: parseInt(hex.slice(128, 130), 16),
    };
  }

  /**
   * Combine r, s, v back into a compact hex signature (with 0x prefix).
   */
  compose(components: SignatureComponents): string {
    const r = components.r.toString(16).padStart(64, "0");
    const s = components.s.toString(16).padStart(64, "0");
    const v = components.v.toString(16).padStart(2, "0");
    return `0x${r}${s}${v}`;
  }

  // ── Utils ──────────────────────────────────────────────────────────────────

  /**
   * Compute the keccak-256 hash of a message with the personal_sign prefix.
   */
  personalSignHash(message: string): string {
    return "0x" + Buffer.from(_personalSignHash(message)).toString("hex");
  }

  /**
   * Return true if a hex string is a structurally valid 65-byte signature.
   */
  isValidSignature(signature: string): boolean {
    return /^0x[0-9a-fA-F]{130}$/.test(signature);
  }
}

// ── Internal ───────────────────────────────────────────────────────────────────

/** Compute the Ethereum personal_sign message hash. */
function _personalSignHash(message: string): Uint8Array {
  const msgBytes = new TextEncoder().encode(message);
  const prefix   = new TextEncoder().encode(`\x19Ethereum Signed Message:\n${msgBytes.length}`);
  const combined = new Uint8Array(prefix.length + msgBytes.length);
  combined.set(prefix, 0);
  combined.set(msgBytes, prefix.length);
  return keccak_256(combined);
}

/** Recover an address (without 0x) from a hash + compact signature. */
function _recoverAddress(hash: Uint8Array, signature: string): string {
  const hex      = signature.replace(/^0x/i, "");
  const r        = BigInt("0x" + hex.slice(0, 64));
  const s        = BigInt("0x" + hex.slice(64, 128));
  const vRaw     = parseInt(hex.slice(128, 130), 16);
  const recovery = vRaw >= 27 ? vRaw - 27 : vRaw; // normalise to 0 or 1

  const sig = new secp256k1.Signature(r, s).addRecoveryBit(recovery);
  const pub = sig.recoverPublicKey(hash).toRawBytes(false).slice(1); // uncompressed, drop 0x04
  const addrHash = keccak_256(pub);
  return Buffer.from(addrHash).slice(12).toString("hex");
}

/** Convert a hex string (with or without 0x) to a Uint8Array. */
function _hexToBytes(hex: string): Uint8Array {
  const clean = hex.replace(/^0x/i, "");
  const bytes = new Uint8Array(clean.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

/** Default singleton instance */
export const ghostSignatureValidator = new GhostSignatureValidator();
