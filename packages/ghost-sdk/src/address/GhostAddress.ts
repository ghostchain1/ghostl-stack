/**
 * GhostAddress — branded address utilities for GhostChain.
 *
 * Re-exports and extends the native address primitives with:
 * – branded `GhostAddress` type verification helpers
 * – zero / dead address constants
 * – contract address derivation (CREATE + CREATE2)
 * – byte-level helpers
 */

import type { GhostAddress, Hex } from "../native/types.js";
import {
  isAddress,
  assertAddress,
  toChecksumAddress,
  normalizeAddress,
  addressToBytes,
} from "../native/address.js";
import { keccak256Raw, keccak256 } from "../hash/GhostHash.js";
import { hexToBytes, bytesToHex } from "../native/bytes.js";
import { strip0x, add0x, padHex } from "../native/hex.js";
import { GhostValidationError } from "../errors/GhostErrors.js";

// Re-export native helpers
export {
  isAddress,
  assertAddress,
  toChecksumAddress,
  normalizeAddress,
  addressToBytes,
};

// ── Constants ─────────────────────────────────────────────────────────────────

/** The zero address (0x000...000). */
export const GHOST_ZERO_ADDRESS: GhostAddress =
  "0x0000000000000000000000000000000000000000" as GhostAddress;

/** The "dead" burn address (0xdead). */
export const GHOST_DEAD_ADDRESS: GhostAddress =
  "0x000000000000000000000000000000000000dEaD" as GhostAddress;

/** Maximum possible address value. */
export const GHOST_MAX_ADDRESS: GhostAddress =
  "0xFFfFfFffFFfffFFfFFfFFFFFffFFFffffFfFFFfF" as GhostAddress;

// ── Predicates ────────────────────────────────────────────────────────────────

/** True when the address is all-zeros (zero address). */
export function isZeroAddress(addr: string): boolean {
  return /^0x0{40}$/i.test(addr);
}

/** True when two addresses are equal (case-insensitive). */
export function addressEqual(a: string, b: string): boolean {
  return a.toLowerCase() === b.toLowerCase();
}

/** Convert any address string to a padded 32-byte hex (for ABI encoding). */
export function addressToWord(addr: GhostAddress): Hex {
  return padHex(add0x(strip0x(addr).toLowerCase()), 32);
}

/** Extract an address from a 32-byte ABI-encoded word. */
export function wordToAddress(word: Hex): GhostAddress {
  const raw = strip0x(word);
  if (raw.length !== 64) throw new GhostValidationError("word must be 32 bytes");
  return normalizeAddress(add0x(raw.slice(24)));
}

// ── Contract address derivation ───────────────────────────────────────────────

/**
 * Derive the address of a contract deployed via `CREATE`.
 *
 * @param deployer  Address of the deploying account.
 * @param nonce     Nonce of the deploying account at deploy time.
 */
export function getCreateAddress(deployer: GhostAddress, nonce: bigint): GhostAddress {
  assertAddress(deployer);
  // RLP-encode: [deployer_bytes, nonce]
  const addrBytes = hexToBytes(deployer as Hex);
  const nonceBytes = nonce === 0n
    ? new Uint8Array(0)
    : hexToBytes(add0x(nonce.toString(16).padStart(nonce.toString(16).length % 2 === 0 ? nonce.toString(16).length : nonce.toString(16).length + 1, "0")));

  // RLP(list): 0xc0 + len, then each item prefixed by 0x80+len (if < 56 bytes)
  function rlpItem(b: Uint8Array): Uint8Array {
    if (b.length === 0) return new Uint8Array([0x80]);
    if (b.length === 1 && b[0]! < 0x80) return b;
    if (b.length <= 55) {
      const out = new Uint8Array(1 + b.length);
      out[0] = 0x80 + b.length;
      out.set(b, 1);
      return out;
    }
    throw new GhostValidationError("RLP item too large for getCreateAddress");
  }

  const encAddr = rlpItem(addrBytes);
  const encNonce = rlpItem(nonceBytes);
  const payload = new Uint8Array(encAddr.length + encNonce.length);
  payload.set(encAddr, 0);
  payload.set(encNonce, encAddr.length);

  const listHeader = new Uint8Array(1 + payload.length);
  listHeader[0] = 0xc0 + payload.length;
  listHeader.set(payload, 1);

  const hash = keccak256Raw(listHeader);
  return normalizeAddress(add0x(bytesToHex(hash).slice(-40)));
}

/**
 * Derive the address of a contract deployed via `CREATE2`.
 *
 * @param deployer  Address of the factory contract.
 * @param salt      32-byte salt (hex).
 * @param initCodeHash  keccak256 of the init bytecode (hex).
 */
export function getCreate2Address(
  deployer: GhostAddress,
  salt: Hex,
  initCodeHash: Hex,
): GhostAddress {
  assertAddress(deployer);
  const addrBytes = hexToBytes(deployer as Hex);
  const saltBytes = hexToBytes(padHex(salt, 32));
  const hashBytes = hexToBytes(padHex(initCodeHash, 32));

  const buf = new Uint8Array(1 + 20 + 32 + 32);
  buf[0] = 0xff;
  buf.set(addrBytes, 1);
  buf.set(saltBytes, 21);
  buf.set(hashBytes, 53);

  const resultHash = keccak256Raw(buf);
  return normalizeAddress(add0x(bytesToHex(resultHash.slice(12))));
}

// ── Formatting helpers ────────────────────────────────────────────────────────

/** Shorten an address to `0x1234…abcd` for display. */
export function shortenAddress(addr: GhostAddress, chars = 4): string {
  const s = strip0x(addr);
  return `0x${s.slice(0, chars)}…${s.slice(-chars)}`;
}

/** Convert address to lowercase (non-checksummed). */
export function addressToLower(addr: string): GhostAddress {
  if (!isAddress(addr)) throw new GhostValidationError(`Not an address: ${addr}`);
  return addr.toLowerCase() as GhostAddress;
}
