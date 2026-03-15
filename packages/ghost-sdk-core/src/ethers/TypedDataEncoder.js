"use strict";
// ─────────────────────────────────────────────────────────────────────────────
// TypedDataEncoder – ethers v6-compatible EIP-712 encoder
// Computes domain separator, struct hashes, and the final digest.
// ─────────────────────────────────────────────────────────────────────────────
Object.defineProperty(exports, "__esModule", { value: true });
exports.TypedDataEncoder = void 0;
const keccak_1 = require("../crypto/keccak");
const AbiCoder_1 = require("./AbiCoder");
const abiCoder = new AbiCoder_1.AbiCoder();
class TypedDataEncoder {
    _types;
    _primaryType;
    constructor(types) {
        // Remove EIP712Domain from types (handled separately)
        this._types = Object.fromEntries(Object.entries(types).filter(([k]) => k !== "EIP712Domain"));
        // Primary type = first key that isn't EIP712Domain
        this._primaryType = Object.keys(this._types)[0];
        if (!this._primaryType)
            throw new Error("TypedDataEncoder: no primary type found");
    }
    // ─── Static convenience ──────────────────────────────────────────────────
    /** Compute the full EIP-712 digest: keccak256(\x19\x01 || domainSep || structHash) */
    static hash(domain, types, value) {
        const encoder = new TypedDataEncoder(types);
        const domainSep = TypedDataEncoder.hashDomain(domain);
        const structHash = encoder.hashStruct(encoder._primaryType, value);
        const prefix = Uint8Array.from([0x19, 0x01]);
        const combined = new Uint8Array([...prefix, ...domainSep, ...structHash]);
        return (0, keccak_1.keccak256Hex)(combined);
    }
    /** Compute just the domain separator hash — returns 0x-prefixed hex string (ethers v6-compatible). */
    static hashDomainHex(domain) {
        return (0, keccak_1.keccak256Hex)(TypedDataEncoder.hashDomain(domain));
    }
    /** 3-argument static hashStruct (ethers v6 API). Returns 0x-prefixed hex string. */
    static hashStructHex(primaryType, types, value) {
        const encoder = new TypedDataEncoder(types);
        return (0, keccak_1.keccak256Hex)(encoder.hashStruct(primaryType, value));
    }
    /** Compute just the domain separator hash. */
    static hashDomain(domain) {
        const typeFields = [];
        const values = [];
        const domainTypeHash = _typeHash("EIP712Domain", _domainFields(domain));
        if (domain.name !== undefined) {
            typeFields.push("string name");
            values.push(domain.name);
        }
        if (domain.version !== undefined) {
            typeFields.push("string version");
            values.push(domain.version);
        }
        if (domain.chainId !== undefined) {
            typeFields.push("uint256 chainId");
            values.push(BigInt(domain.chainId));
        }
        if (domain.verifyingContract !== undefined) {
            typeFields.push("address verifyingContract");
            values.push(domain.verifyingContract);
        }
        if (domain.salt !== undefined) {
            typeFields.push("bytes32 salt");
            values.push(domain.salt);
        }
        // Encode: keccak256(domainTypeHash || abi.encode(fields))
        const encoded = _encodeStruct(domainTypeHash, typeFields, values);
        return (0, keccak_1.keccak256)(encoded);
    }
    /** Compute the struct hash for a given type name and value. */
    hashStruct(primaryType, value) {
        const fields = this._types[primaryType];
        if (!fields)
            throw new Error(`TypedDataEncoder: unknown type ${primaryType}`);
        const typeHash = _typeHash(primaryType, fields.map((f) => `${f.type} ${f.name}`));
        const typeFields = fields.map((f) => `${f.type} ${f.name}`);
        const values = fields.map((f) => {
            const v = value[f.name];
            // Recursively hash nested structs
            if (this._types[f.type])
                return this.hashStruct(f.type, v);
            // String/bytes → keccak256
            if (f.type === "string")
                return (0, keccak_1.keccak256)(new TextEncoder().encode(v));
            if (f.type === "bytes")
                return typeof v === "string"
                    ? (0, keccak_1.keccak256)(Uint8Array.from(Buffer.from(v.replace("0x", ""), "hex")))
                    : (0, keccak_1.keccak256)(v);
            return v;
        });
        return (0, keccak_1.keccak256)(_encodeStruct(typeHash, typeFields, values));
    }
    /** Returns the EIP-712 type string for the primary type, e.g. "Mail(string from,string to)" */
    encodeType(primaryType) {
        const type = primaryType ?? this._primaryType;
        const fields = this._types[type];
        if (!fields)
            throw new Error(`TypedDataEncoder: unknown type ${type}`);
        return `${type}(${fields.map((f) => `${f.type} ${f.name}`).join(",")})`;
    }
    /** The keccak256 of the full type string. */
    typeHash(primaryType) {
        return (0, keccak_1.keccak256Hex)(new TextEncoder().encode(this.encodeType(primaryType)));
    }
}
exports.TypedDataEncoder = TypedDataEncoder;
// ─── Internal helpers ────────────────────────────────────────────────────────
function _typeHash(typeName, fields) {
    const sig = `${typeName}(${fields.join(",")})`;
    return (0, keccak_1.keccak256)(new TextEncoder().encode(sig));
}
function _domainFields(domain) {
    const fields = [];
    if (domain.name !== undefined)
        fields.push("string name");
    if (domain.version !== undefined)
        fields.push("string version");
    if (domain.chainId !== undefined)
        fields.push("uint256 chainId");
    if (domain.verifyingContract !== undefined)
        fields.push("address verifyingContract");
    if (domain.salt !== undefined)
        fields.push("bytes32 salt");
    return fields;
}
function _encodeStruct(typeHash, typeFields, values) {
    // Build flat list of abi-encoded words
    const words = [typeHash];
    for (let i = 0; i < typeFields.length; i++) {
        const type = typeFields[i].split(" ")[0];
        const val = values[i];
        if (val instanceof Uint8Array) {
            words.push(val); // already hashed (struct/string/bytes)
        }
        else {
            const encoded = abiCoder.encode([type], [val]);
            words.push(Uint8Array.from(Buffer.from(encoded.slice(2), "hex")));
        }
    }
    const total = words.reduce((s, w) => s + w.length, 0);
    const out = new Uint8Array(total);
    let pos = 0;
    for (const w of words) {
        out.set(w, pos);
        pos += w.length;
    }
    return out;
}
