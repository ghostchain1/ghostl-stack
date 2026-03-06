/**
 * @file index.ts
 * @module @ghostchain/ghostchain-bloom-filters
 *
 * GhostChain bloom filter utilities.
 * Drop-in replacement for ethereum-bloom-filters.
 * Zero ethers dependency. Uses keccak-256 via @noble/hashes.
 *
 * Implements the EIP-234 / Yellow Paper §H bloom filter:
 * - 2048-bit (256-byte) bloom bitvector
 * - Three bit positions derived from the lowest 11 bits of the first 6 bytes
 *   of the keccak256 hash of the value
 */
import { keccak_256 } from "@noble/hashes/sha3";

// ─── Internal helpers ─────────────────────────────────────────────────────────

function hexToKeccak(hex: string): string {
  const stripped = hex.startsWith("0x") ? hex.slice(2) : hex;
  const bytes = new Uint8Array(stripped.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(stripped.slice(i * 2, i * 2 + 2), 16);
  }
  const hash = keccak_256(bytes);
  return Array.from(hash).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function bytesToKeccak(bytes: Uint8Array): string {
  const hash = keccak_256(bytes);
  return Array.from(hash).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function codePointToInt(codePoint: number): number {
  if (codePoint >= 48 && codePoint <= 57) return codePoint - 48;       // 0-9
  if (codePoint >= 65 && codePoint <= 70) return codePoint - 55;       // A-F
  if (codePoint >= 97 && codePoint <= 102) return codePoint - 87;      // a-f
  throw new Error("Invalid bloom character");
}

function padLeft(hex: string, length: number): string {
  const stripped = hex.startsWith("0x") ? hex.slice(2) : hex;
  return stripped.padStart(length, "0");
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Returns true if `bloom` is a valid 256-byte (512 hex-char) bloom filter.
 */
export function isBloom(bloom: string): boolean {
  if (typeof bloom !== "string") return false;
  if (!/^(0x)?[0-9a-f]{512}$/i.test(bloom)) return false;
  if (
    /^(0x)?[0-9a-f]{512}$/.test(bloom) ||
    /^(0x)?[0-9A-F]{512}$/.test(bloom)
  )
    return true;
  return false;
}

/**
 * Returns true if `value` is a member of the given bloom filter.
 * Note: false positives are possible.
 *
 * @param bloom  512 hex-char encoded bloom filter (with or without 0x prefix)
 * @param value  value to test — 0x-hex string or raw bytes
 */
export function isInBloom(bloom: string, value: string | Uint8Array): boolean {
  const hash =
    value instanceof Uint8Array
      ? bytesToKeccak(value)
      : hexToKeccak(value);

  for (let i = 0; i < 12; i += 4) {
    const bitpos =
      ((parseInt(hash.slice(i, i + 2), 16) << 8) +
        parseInt(hash.slice(i + 2, i + 4), 16)) &
      2047;

    const code = codePointToInt(
      bloom.charCodeAt(bloom.length - 1 - Math.floor(bitpos / 4)),
    );
    const offset = 1 << bitpos % 4;
    if ((code & offset) !== offset) return false;
  }
  return true;
}

/**
 * Returns true if `ghostAddress` (a GhostChain account address) is in `bloom`.
 * The address is zero-padded to 32 bytes before the bloom check.
 *
 * @param bloom        the bloom filter (512 hex chars)
 * @param ghostAddress a 20-byte (40 hex-char) 0x-prefixed address
 */
export function isUserGhostAddressInBloom(
  bloom: string,
  ghostAddress: string,
): boolean {
  if (!isBloom(bloom)) throw new Error("Invalid bloom given");
  if (!isAddress(ghostAddress))
    throw new Error(`Invalid GhostChain address: "${ghostAddress}"`);
  // Pad address to 32 bytes (64 hex chars, no 0x prefix)
  const padded = padLeft(ghostAddress, 64);
  return isInBloom(bloom, padded);
}

/**
 * Alias for {@link isUserGhostAddressInBloom} for drop-in compatibility with
 * ethereum-bloom-filters consumers that call `isUserEthereumAddressInBloom`.
 */
export const isUserEthereumAddressInBloom = isUserGhostAddressInBloom;

/**
 * Returns true if `contractAddress` is in `bloom`.
 * Contract addresses are not padded (unlike user addresses).
 *
 * @param bloom            the bloom filter
 * @param contractAddress  a 20-byte (40 hex-char) 0x-prefixed contract address
 */
export function isContractAddressInBloom(
  bloom: string,
  contractAddress: string,
): boolean {
  if (!isBloom(bloom)) throw new Error("Invalid bloom given");
  if (!isAddress(contractAddress))
    throw new Error(`Invalid contract address: "${contractAddress}"`);
  return isInBloom(bloom, contractAddress);
}

/**
 * Returns true if `topic` (a 32-byte keccak event topic) is in `bloom`.
 *
 * @param bloom  the bloom filter
 * @param topic  a 32-byte (64 hex-char) 0x-prefixed topic hash
 */
export function isTopicInBloom(bloom: string, topic: string): boolean {
  if (!isBloom(bloom)) throw new Error("Invalid bloom given");
  if (!isTopic(topic)) throw new Error("Invalid topic");
  return isInBloom(bloom, topic);
}

/**
 * Returns true if `topic` is a valid 32-byte 0x-prefixed hex topic.
 */
export function isTopic(topic: string): boolean {
  if (typeof topic !== "string") return false;
  if (!/^(0x)?[0-9a-f]{64}$/i.test(topic)) return false;
  if (
    /^(0x)?[0-9a-f]{64}$/.test(topic) ||
    /^(0x)?[0-9A-F]{64}$/.test(topic)
  )
    return true;
  return false;
}

/**
 * Returns true if `address` is a valid 20-byte (40 hex-char) GhostChain address.
 * Accepts both lower-case and checksum-cased addresses, with or without 0x.
 */
export function isAddress(address: string): boolean {
  if (typeof address !== "string") return false;
  return /^(0x)?[0-9a-fA-F]{40}$/.test(address);
}
