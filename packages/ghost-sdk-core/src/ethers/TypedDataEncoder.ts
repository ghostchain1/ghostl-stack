// ─────────────────────────────────────────────────────────────────────────────
// TypedDataEncoder – ethers v6-compatible EIP-712 encoder
// Computes domain separator, struct hashes, and the final digest.
// ─────────────────────────────────────────────────────────────────────────────

import { keccak256, keccak256Hex } from "../crypto/keccak";
import type { GhostTypedDataDomain, GhostTypedDataTypes, GhostTypedDataField } from "../types";
import { AbiCoder } from "./AbiCoder";

export { GhostTypedDataDomain as TypedDataDomain };
export { GhostTypedDataTypes as TypedDataTypes };
export { GhostTypedDataField as TypedDataField };

const abiCoder = new AbiCoder();

export class TypedDataEncoder {
  private _types:       GhostTypedDataTypes;
  private _primaryType: string;

  constructor(types: GhostTypedDataTypes) {
    // Remove EIP712Domain from types (handled separately)
    this._types = Object.fromEntries(
      Object.entries(types).filter(([k]) => k !== "EIP712Domain")
    );
    // Primary type = first key that isn't EIP712Domain
    this._primaryType = Object.keys(this._types)[0];
    if (!this._primaryType) throw new Error("TypedDataEncoder: no primary type found");
  }

  // ─── Static convenience ──────────────────────────────────────────────────

  /** Compute the full EIP-712 digest: keccak256(\x19\x01 || domainSep || structHash) */
  static hash(
    domain: GhostTypedDataDomain,
    types:  GhostTypedDataTypes,
    value:  Record<string, unknown>
  ): string {
    const encoder       = new TypedDataEncoder(types);
    const domainSep     = TypedDataEncoder.hashDomain(domain);
    const structHash    = encoder.hashStruct(encoder._primaryType, value);
    const prefix        = Uint8Array.from([0x19, 0x01]);
    const combined      = new Uint8Array([...prefix, ...domainSep, ...structHash]);
    return keccak256Hex(combined);
  }

  /** Compute just the domain separator hash. */
  static hashDomain(domain: GhostTypedDataDomain): Uint8Array {
    const typeFields: string[] = [];
    const values:     unknown[] = [];

    const domainTypeHash = _typeHash("EIP712Domain", _domainFields(domain));

    if (domain.name              !== undefined) { typeFields.push("string name");              values.push(domain.name); }
    if (domain.version           !== undefined) { typeFields.push("string version");           values.push(domain.version); }
    if (domain.chainId           !== undefined) { typeFields.push("uint256 chainId");          values.push(BigInt(domain.chainId)); }
    if (domain.verifyingContract !== undefined) { typeFields.push("address verifyingContract"); values.push(domain.verifyingContract); }
    if (domain.salt              !== undefined) { typeFields.push("bytes32 salt");             values.push(domain.salt); }

    // Encode: keccak256(domainTypeHash || abi.encode(fields))
    const encoded = _encodeStruct(domainTypeHash, typeFields, values);
    return keccak256(encoded);
  }

  /** Compute the struct hash for a given type name and value. */
  hashStruct(primaryType: string, value: Record<string, unknown>): Uint8Array {
    const fields     = this._types[primaryType];
    if (!fields)     throw new Error(`TypedDataEncoder: unknown type ${primaryType}`);
    const typeHash   = _typeHash(primaryType, fields.map((f) => `${f.type} ${f.name}`));
    const typeFields = fields.map((f) => `${f.type} ${f.name}`);
    const values     = fields.map((f) => {
      const v = value[f.name];
      // Recursively hash nested structs
      if (this._types[f.type]) return this.hashStruct(f.type, v as Record<string, unknown>);
      // String/bytes → keccak256
      if (f.type === "string") return keccak256(new TextEncoder().encode(v as string));
      if (f.type === "bytes")  return typeof v === "string"
        ? keccak256(Uint8Array.from(Buffer.from((v as string).replace("0x", ""), "hex")))
        : keccak256(v as Uint8Array);
      return v;
    });
    return keccak256(_encodeStruct(typeHash, typeFields, values));
  }

  /** Returns the EIP-712 type string for the primary type, e.g. "Mail(string from,string to)" */
  encodeType(primaryType?: string): string {
    const type = primaryType ?? this._primaryType;
    const fields = this._types[type];
    if (!fields) throw new Error(`TypedDataEncoder: unknown type ${type}`);
    return `${type}(${fields.map((f) => `${f.type} ${f.name}`).join(",")})`;
  }

  /** The keccak256 of the full type string. */
  typeHash(primaryType?: string): string {
    return keccak256Hex(new TextEncoder().encode(this.encodeType(primaryType)));
  }
}

// ─── Internal helpers ────────────────────────────────────────────────────────

function _typeHash(typeName: string, fields: string[]): Uint8Array {
  const sig = `${typeName}(${fields.join(",")})`;
  return keccak256(new TextEncoder().encode(sig));
}

function _domainFields(domain: GhostTypedDataDomain): string[] {
  const fields: string[] = [];
  if (domain.name              !== undefined) fields.push("string name");
  if (domain.version           !== undefined) fields.push("string version");
  if (domain.chainId           !== undefined) fields.push("uint256 chainId");
  if (domain.verifyingContract !== undefined) fields.push("address verifyingContract");
  if (domain.salt              !== undefined) fields.push("bytes32 salt");
  return fields;
}

function _encodeStruct(typeHash: Uint8Array, typeFields: string[], values: unknown[]): Uint8Array {
  // Build flat list of abi-encoded words
  const words: Uint8Array[] = [typeHash];
  for (let i = 0; i < typeFields.length; i++) {
    const type  = typeFields[i].split(" ")[0];
    const val   = values[i];
    if (val instanceof Uint8Array) {
      words.push(val); // already hashed (struct/string/bytes)
    } else {
      const encoded = abiCoder.encode([type], [val]);
      words.push(Uint8Array.from(Buffer.from(encoded.slice(2), "hex")));
    }
  }
  const total = words.reduce((s, w) => s + w.length, 0);
  const out   = new Uint8Array(total);
  let pos     = 0;
  for (const w of words) { out.set(w, pos); pos += w.length; }
  return out;
}
