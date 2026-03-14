/**
 * @ghostchain/ghostchainjs-tx — internal utilities
 *
 * Shared helpers for transaction field normalisation and encoding.
 * Zero ethers dependency.
 */

import type { BytesLike, HexString, AccessList, AccessListItem } from "./types.js";

// ── Primitive coercion ────────────────────────────────────────────────────────

/** Normalise any numeric-ish value to bigint */
export function toBigInt(v: bigint | number | string | undefined | null): bigint {
  if (v === undefined || v === null) return 0n;
  if (typeof v === "bigint") return v;
  if (typeof v === "number") return BigInt(v);
  const s = v.trim();
  if (s.startsWith("0x") || s.startsWith("0X")) return BigInt(s);
  return BigInt(s);
}

/** Normalise a hex address / bytes value to a Uint8Array */
export function toBytes(v: BytesLike | undefined | null): Uint8Array {
  if (v === undefined || v === null) return new Uint8Array(0);
  if (v instanceof Uint8Array) return v;
  const s = (v as string).trim();
  if (s === "0x" || s === "") return new Uint8Array(0);
  const hex = s.startsWith("0x") ? s.slice(2) : s;
  const padded = hex.length % 2 ? "0" + hex : hex;
  const out = new Uint8Array(padded.length / 2);
  for (let i = 0; i < out.length; i++) {
    out[i] = parseInt(padded.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

/** Encode a bigint as the minimal big-endian byte array (for RLP) */
export function bigIntToBytes(v: bigint): Uint8Array {
  if (v === 0n) return new Uint8Array(0);
  let hex = v.toString(16);
  if (hex.length % 2) hex = "0" + hex;
  return toBytes("0x" + hex);
}

/** Encode to 20-byte address, returns empty if null/undefined */
export function toAddressBytes(v: HexString | null | undefined): Uint8Array {
  if (!v) return new Uint8Array(0);
  const b = toBytes(v);
  if (b.length !== 20) throw new Error(`GhostTx: invalid address length ${b.length} (expected 20)`);
  return b;
}

/** Convert a Uint8Array to 0x-prefixed lowercase hex */
export function bytesToHex(b: Uint8Array): HexString {
  return ("0x" + Array.from(b).map(x => x.toString(16).padStart(2,"0")).join("")) as HexString;
}

// ── Access list encoding ──────────────────────────────────────────────────────

/** Encode an EIP-2930 access list to RLP-ready nested arrays */
export function encodeAccessList(list: AccessList | undefined): Input[] {
  if (!list || list.length === 0) return [];
  return list.map((item: AccessListItem) => [
    toBytes(item.address),
    item.storageKeys.map(k => toBytes(k)),
  ]);
}

// ── Keccak-256 ────────────────────────────────────────────────────────────────

import { keccak_256 } from "@noble/hashes/sha3";

export function keccak256(data: Uint8Array): Uint8Array {
  return keccak_256(data);
}

// ── RLP helpers ───────────────────────────────────────────────────────────────

import { encode as rlpEncode, type Input } from "@ghostchain/ghostchainjs-rlp";

export { rlpEncode };

// ── ECDSA signing ─────────────────────────────────────────────────────────────

import { secp256k1 } from "@noble/curves/secp256k1";

/**
 * Sign a 32-byte message hash with a private key.
 * Returns { v, r, s } as raw values for embedding in a transaction.
 */
export function ecSign(msgHash: Uint8Array, privateKey: Uint8Array): { v: bigint; r: Uint8Array; s: Uint8Array } {
  const sig = secp256k1.sign(msgHash, privateKey, { lowS: true });
  const r = new Uint8Array(32);
  const s = new Uint8Array(32);
  // noble/curves returns r,s as bigints; encode as 32-byte big-endian
  const rHex = sig.r.toString(16).padStart(64, "0");
  const sHex = sig.s.toString(16).padStart(64, "0");
  for (let i = 0; i < 32; i++) {
    r[i] = parseInt(rHex.slice(i * 2, i * 2 + 2), 16);
    s[i] = parseInt(sHex.slice(i * 2, i * 2 + 2), 16);
  }
  return { v: BigInt(sig.recovery), r, s };
}
