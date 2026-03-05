import type { GhostAddress, Hex } from "./types.js";
import { GhostValidationError } from "../errors/GhostErrors.js";
import { keccak256Bytes } from "./keccak.js";
import { hexToBytes, bytesToHex } from "./bytes.js";
import { strip0x, add0x } from "./hex.js";

export function isAddress(a: string): a is GhostAddress {
  return /^0x[0-9a-fA-F]{40}$/.test(a);
}

export function assertAddress(a: string, label = "address"): asserts a is GhostAddress {
  if (!isAddress(a)) throw new GhostValidationError(`Invalid ${label}: ${a}`);
}

/**
 * EIP-55 checksum address.
 * The underlying hash function is keccak256 — same algorithm used across
 * all EVM-compatible chains. The GhostChain stack inherits this standard
 * address format for full tooling compatibility.
 */
export function toChecksumAddress(addr: GhostAddress): GhostAddress {
  const lower = strip0x(addr).toLowerCase();
  const hash = bytesToHex(keccak256Bytes(new TextEncoder().encode(lower)));
  const hashStr = strip0x(hash);
  let out = "0x";
  for (let i = 0; i < lower.length; i++) {
    const c = lower[i]!;
    const h = parseInt(hashStr[i]!, 16);
    out += h >= 8 ? c.toUpperCase() : c;
  }
  return out as GhostAddress;
}

export function normalizeAddress(addr: string): GhostAddress {
  if (!isAddress(addr)) throw new GhostValidationError(`Invalid address: ${addr}`);
  return toChecksumAddress(addr as GhostAddress);
}

export function addressToBytes(addr: GhostAddress): Uint8Array {
  assertAddress(addr);
  return hexToBytes(addr as Hex);
}
