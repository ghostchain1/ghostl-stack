/**
 * GhostSecurity — address validation, signature verification, and input
 * sanitation utilities for GhostChain applications.
 *
 * Uses @noble/hashes for keccak-256 (already in ghost-sdk dependencies).
 */

import { keccak_256 } from "@noble/hashes/sha3";

// ── Constants ────────────────────────────────────────────────────────────────

/** A ghost address is a 0x-prefixed 20-byte hex string (42 chars). */
const ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/;

/** A 32-byte hash (tx hash, block hash, topic, etc.). */
const HASH32_RE = /^0x[0-9a-fA-F]{64}$/;

/** Hex-encoded bytes (variable length, 0x-prefixed). */
const HEX_DATA_RE = /^0x(?:[0-9a-fA-F]{2})*$/;

// ── GhostSecurityError ───────────────────────────────────────────────────────

export class GhostSecurityError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GhostSecurityError";
  }
}

// ── GhostSecurity ────────────────────────────────────────────────────────────

export class GhostSecurity {
  // ── Address validation ───────────────────────────────────────────────────

  /**
   * Returns true if `addr` is a syntactically valid Ghost/EVM address.
   * Does NOT perform EIP-55 checksum validation — use `validateChecksumAddress`
   * for that.
   */
  static isValidAddress(addr: string): boolean {
    return ADDRESS_RE.test(addr);
  }

  /**
   * Throws `GhostSecurityError` if `addr` is not a valid Ghost address.
   */
  static assertAddress(addr: string, fieldName = "address"): void {
    if (!ADDRESS_RE.test(addr)) {
      throw new GhostSecurityError(
        `Invalid Ghost address for "${fieldName}": ${addr}. ` +
        `Expected 0x-prefixed 20-byte hex.`
      );
    }
  }

  /**
   * Validate EIP-55 mixed-case checksum address.
   * Returns true only when the checksum matches.
   */
  static isChecksumAddress(addr: string): boolean {
    if (!ADDRESS_RE.test(addr)) return false;
    const hex = addr.slice(2).toLowerCase();
    // Produce keccak256 of the lowercased hex without 0x prefix.
    const hash = GhostSecurity._keccakHex(hex);
    for (let i = 0; i < 40; i++) {
      const ch = hex[i];
      const nibble = parseInt(hash[i], 16);
      if (nibble >= 8 && ch !== ch.toUpperCase()) return false;
      if (nibble < 8  && ch !== ch.toLowerCase()) return false;
    }
    return true;
  }

  // ── Hash / bytes validation ──────────────────────────────────────────────

  static isValidHash(value: string): boolean {
    return HASH32_RE.test(value);
  }

  static assertHash(value: string, fieldName = "hash"): void {
    if (!HASH32_RE.test(value)) {
      throw new GhostSecurityError(
        `Invalid 32-byte hash for "${fieldName}": ${value}.`
      );
    }
  }

  static isValidHexData(value: string): boolean {
    return HEX_DATA_RE.test(value);
  }

  static assertHexData(value: string, fieldName = "data"): void {
    if (!HEX_DATA_RE.test(value)) {
      throw new GhostSecurityError(
        `Invalid hex data for "${fieldName}": ${value}. ` +
        `Expected 0x-prefixed even-length hex string.`
      );
    }
  }

  // ── Private-key validation ───────────────────────────────────────────────

  /**
   * Returns true if value looks like a 32-byte (256-bit) private key.
   * Does NOT check secp256k1 curve order — a full check requires @noble/curves.
   */
  static isValidPrivateKey(key: string): boolean {
    return HASH32_RE.test(key) && key !== "0x" + "0".repeat(64);
  }

  static assertPrivateKey(key: string): void {
    if (!GhostSecurity.isValidPrivateKey(key)) {
      throw new GhostSecurityError(
        "Invalid private key: must be a non-zero 32-byte hex string."
      );
    }
  }

  // ── Value / amount guards ────────────────────────────────────────────────

  static assertPositive(value: bigint, fieldName = "value"): void {
    if (value <= 0n) {
      throw new GhostSecurityError(
        `"${fieldName}" must be a positive bigint, got ${value}.`
      );
    }
  }

  static assertNonNegative(value: bigint, fieldName = "value"): void {
    if (value < 0n) {
      throw new GhostSecurityError(
        `"${fieldName}" must be non-negative, got ${value}.`
      );
    }
  }

  // ── Input sanitisation ───────────────────────────────────────────────────

  /** Normalise an address to lowercase `0x`-prefixed form. */
  static normalizeAddress(addr: string): string {
    GhostSecurity.assertAddress(addr);
    return "0x" + addr.slice(2).toLowerCase();
  }

  /** Strip dangerous characters from an arbitrary label / name string. */
  static sanitizeName(name: string, maxLen = 256): string {
    // Allow alphanumeric, hyphens, underscores, dots.
    const cleaned = name.replace(/[^a-zA-Z0-9._-]/g, "").slice(0, maxLen);
    if (cleaned.length === 0) {
      throw new GhostSecurityError("Name sanitised to empty string.");
    }
    return cleaned;
  }

  // ── Internal: keccak-256 (for EIP-55 checksum validation) ───────────────

  private static _keccakHex(input: string): string {
    const bytes = new TextEncoder().encode(input);
    const hash  = keccak_256(bytes);
    return Array.from(hash).map(b => b.toString(16).padStart(2, "0")).join("");
  }
}
