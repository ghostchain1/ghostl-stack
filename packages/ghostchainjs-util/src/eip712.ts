/**
 * @file eip712.ts
 * @module @ghostchain/ghostchainjs-util/eip712
 *
 * EIP-712 typed structured data hashing and signing for GhostChain.
 * Implements the complete EIP-712 hashing algorithm — no ethers dependency.
 *
 * Reference: https://eips.ethereum.org/EIPS/eip-712
 */

import { keccak256, keccak256Hex } from "./hash.js";
import { hexToBytes, bytesToHex, padLeft } from "./hex.js";
import { GhostUtilError } from "./errors.js";
import type {
  GhostTypedDataDomain,
  GhostTypedDataTypes,
  GhostTypedDataField,
} from "./types.js";

// ─── Type encoder ─────────────────────────────────────────────────────────────

/**
 * Encode a type string for a given type name, including all referenced types.
 * e.g. encodeType("Mail", types) → "Mail(Person from,Person to,string contents)Person(string name,address wallet)"
 */
export function encodeType(typeName: string, types: GhostTypedDataTypes): string {
  if (!types[typeName])
    throw new GhostUtilError("EIP712_ERROR", `encodeType: unknown type "${typeName}"`);

  const deps = new Set<string>();
  _collectDeps(typeName, types, deps);
  deps.delete(typeName);

  // Primary type first, then dependencies sorted alphabetically
  const sorted = [typeName, ...[...deps].sort()];
  return sorted
    .filter((t) => types[t])
    .map((t) => `${t}(${types[t].map((f) => `${f.type} ${f.name}`).join(",")})`)
    .join("");
}

function _collectDeps(
  typeName: string,
  types: GhostTypedDataTypes,
  seen: Set<string>,
): void {
  if (seen.has(typeName) || !types[typeName]) return;
  seen.add(typeName);
  for (const field of types[typeName]) {
    // Extract base type (strip array suffix)
    const base = field.type.replace(/\[\d*\]$/, "");
    _collectDeps(base, types, seen);
  }
}

/**
 * Compute the typeHash (keccak256 of the encoded type string).
 */
export function typeHash(typeName: string, types: GhostTypedDataTypes): Uint8Array {
  return keccak256(new TextEncoder().encode(encodeType(typeName, types)));
}

// ─── Value encoder ────────────────────────────────────────────────────────────

/**
 * ABI-encode the fields of a struct value. Returns a concatenated bytes buffer
 * suitable for hashing with keccak256.
 */
export function encodeData(
  typeName: string,
  types: GhostTypedDataTypes,
  value: Record<string, unknown>,
): Uint8Array {
  const fields: GhostTypedDataField[] = types[typeName];
  if (!fields)
    throw new GhostUtilError("EIP712_ERROR", `encodeData: unknown type "${typeName}"`);

  const parts: Uint8Array[] = [typeHash(typeName, types)];

  for (const field of fields) {
    parts.push(_encodeField(field.type, value[field.name], types));
  }

  return _concat(...parts);
}

function _encodeField(
  type: string,
  value: unknown,
  types: GhostTypedDataTypes,
): Uint8Array {
  // Atomic types
  if (type === "address") {
    const addr = String(value).toLowerCase().replace("0x", "");
    return _leftPad(hexToBytes("0x" + addr));
  }

  if (type === "bool") {
    return _leftPad(new Uint8Array([value ? 1 : 0]));
  }

  if (type === "bytes") {
    const bytes = typeof value === "string" ? hexToBytes(value) : (value as Uint8Array);
    return keccak256(bytes);
  }

  if (type === "string") {
    return keccak256(new TextEncoder().encode(String(value)));
  }

  if (/^uint\d*$/.test(type) || /^int\d*$/.test(type)) {
    const n = BigInt(String(value));
    const positive = n < 0n ? (1n << 256n) + n : n;
    return hexToBytes("0x" + positive.toString(16).padStart(64, "0"));
  }

  if (/^bytes\d+$/.test(type)) {
    const bytes = typeof value === "string" ? hexToBytes(value) : (value as Uint8Array);
    // right-pad to 32 bytes
    const padded = new Uint8Array(32);
    padded.set(bytes.slice(0, 32));
    return padded;
  }

  // Array type
  if (type.endsWith("]")) {
    const itemType = type.slice(0, type.lastIndexOf("["));
    const arr = value as unknown[];
    const encoded = arr.map((v) => _encodeField(itemType, v, types));
    return keccak256(_concat(...encoded));
  }

  // Struct type (reference)
  if (types[type]) {
    const structHash = hashStruct(type, types, value as Record<string, unknown>);
    return structHash;
  }

  throw new GhostUtilError("EIP712_ERROR", `encodeField: unsupported type "${type}"`);
}

// ─── Struct hasher ────────────────────────────────────────────────────────────

/**
 * Compute hashStruct(s) = keccak256(encodeData(typeOf(s), s)) for a struct.
 */
export function hashStruct(
  typeName: string,
  types: GhostTypedDataTypes,
  value: Record<string, unknown>,
): Uint8Array {
  return keccak256(encodeData(typeName, types, value));
}

// ─── Domain separator ─────────────────────────────────────────────────────────

const DOMAIN_TYPE: GhostTypedDataTypes = {
  EIP712Domain: [
    { name: "name",              type: "string"  },
    { name: "version",           type: "string"  },
    { name: "chainId",           type: "uint256" },
    { name: "verifyingContract", type: "address" },
    { name: "salt",              type: "bytes32" },
  ],
};

/**
 * Compute the domain separator for an EIP-712 domain.
 * Only includes the fields that are defined in the domain object.
 */
export function domainSeparator(domain: GhostTypedDataDomain): Uint8Array {
  const presentFields = DOMAIN_TYPE.EIP712Domain.filter(
    (f) => domain[f.name as keyof GhostTypedDataDomain] !== undefined,
  );
  const domainTypeFields: GhostTypedDataTypes = {
    EIP712Domain: presentFields,
  };
  const domainValue: Record<string, unknown> = {};
  for (const f of presentFields) {
    domainValue[f.name] = domain[f.name as keyof GhostTypedDataDomain];
  }
  return hashStruct("EIP712Domain", domainTypeFields, domainValue);
}

/**
 * Compute the full EIP-712 signing hash:
 * keccak256("\x19\x01" + domainSeparator + hashStruct(message))
 */
export function hashTypedData(
  domain: GhostTypedDataDomain,
  types: GhostTypedDataTypes,
  primaryType: string,
  message: Record<string, unknown>,
): Uint8Array {
  // Filter out EIP712Domain from types before hashing (it's the domain)
  const messageTypes = Object.fromEntries(
    Object.entries(types).filter(([k]) => k !== "EIP712Domain"),
  );

  const ds = domainSeparator(domain);
  const ms = hashStruct(primaryType, messageTypes, message);

  const combined = new Uint8Array(2 + 32 + 32);
  combined[0] = 0x19;
  combined[1] = 0x01;
  combined.set(ds, 2);
  combined.set(ms, 34);
  return keccak256(combined);
}

/**
 * Compute the EIP-712 hash and return it as a 0x-prefixed hex string.
 */
export function hashTypedDataHex(
  domain: GhostTypedDataDomain,
  types: GhostTypedDataTypes,
  primaryType: string,
  message: Record<string, unknown>,
): string {
  return bytesToHex(hashTypedData(domain, types, primaryType, message));
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function _leftPad(bytes: Uint8Array): Uint8Array {
  const out = new Uint8Array(32);
  out.set(bytes, 32 - bytes.length);
  return out;
}

function _concat(...arrays: Uint8Array[]): Uint8Array {
  const total = arrays.reduce((s, a) => s + a.length, 0);
  const out = new Uint8Array(total);
  let pos = 0;
  for (const a of arrays) { out.set(a, pos); pos += a.length; }
  return out;
}
