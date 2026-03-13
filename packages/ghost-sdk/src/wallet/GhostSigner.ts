/**
 * GhostSigner — signer interface and private-key implementation.
 *
 * `GhostSigner` (interface) — implement this to create custom signers
 * (hardware wallet, remote signer, etc.) that plug into GhostWalletClient
 * and GhostNativeContract.
 *
 * `GhostPrivateKeySigner` (class) — concrete implementation backed by a
 * 32-byte secp256k1 private key.  Address is derived correctly:
 *
 *   privateKey  →  secp256k1.getPublicKey(privKey, false)  [65 bytes, uncompressed]
 *               →  drop 0x04 prefix byte                   [64 raw bytes]
 *               →  keccak256(64 bytes)                     [32-byte hash]
 *               →  last 20 bytes                           [GhostChain address]
 *               →  EIP-55 checksum                         [final address]
 *
 * ❌ NEVER:  keccak256(privateKey).slice(0, 42)
 *    This hashes the key itself (wrong input) and slices a hex string by
 *    character count (wrong output), producing a cryptographically invalid
 *    address with no relation to the corresponding public key.
 */

import { secp256k1 } from "@noble/curves/secp256k1";
import type { GhostAddress, Hex, GhostTxRequest } from "../native/types.js";
import { keccak256Bytes } from "../native/keccak.js";
import { hexToBytes, bytesToHex } from "../native/bytes.js";
import { toChecksumAddress } from "../native/address.js";
import { GhostValidationError } from "../errors/GhostErrors.js";
import { GhostTransaction } from "../native/GhostTransaction.js";

// ── GhostSigner interface ─────────────────────────────────────────────────────

export interface GhostSigner {
  /** The address derived from this signer's key material. */
  readonly address: GhostAddress;

  /**
   * Sign an arbitrary 32-byte hash (Keccak256 of some data).
   * Returns a 65-byte compact signature as hex.
   */
  signHash(hash: Hex): Promise<Hex>;

  /**
   * Sign an EIP-191 personal message (adds "\x19GhostChain Signed Message:\n" prefix).
   */
  signMessage(message: string | Uint8Array): Promise<Hex>;

  /**
   * Sign a typed data payload (EIP-712).
   */
  signTypedData(domain: Eip712Domain, types: Record<string, Eip712Type[]>, value: Record<string, unknown>): Promise<Hex>;

  /**
   * Sign and serialize an EIP-1559 (type 2) transaction ready for broadcast.
   * Returns the RLP-encoded signed transaction as hex.
   */
  signTransaction(tx: GhostTxRequest): Promise<Hex>;
}

export type Eip712Domain = {
  name?: string;
  version?: string;
  chainId?: number;
  verifyingContract?: GhostAddress;
  salt?: Hex;
};

export type Eip712Type = {
  name: string;
  type: string;
};

// ── GhostPrivateKeySigner ─────────────────────────────────────────────────────

/**
 * Concrete `GhostSigner` backed by a raw secp256k1 private key.
 *
 * Address derivation (correct):
 *   uncompressed pubkey (65 B) → drop 0x04 prefix → keccak256(64 B) → last 20 B → EIP-55
 *
 * @example
 *   const signer = new GhostPrivateKeySigner(process.env.PRIVATE_KEY!);
 *   console.log(signer.address); // checksummed GhostChain address
 *
 *   const sig = await signer.signMessage("hello ghost");
 */
export class GhostPrivateKeySigner implements GhostSigner {
  private readonly _priv: Uint8Array;
  readonly address: GhostAddress;

  constructor(privateKey: Hex) {
    if (!/^0x[0-9a-fA-F]{64}$/.test(privateKey)) {
      throw new GhostValidationError(
        "GhostPrivateKeySigner: private key must be a 0x-prefixed 32-byte hex string (64 hex chars)"
      );
    }
    this._priv  = hexToBytes(privateKey);

    // ✅ Correct address derivation:
    //   1. Uncompressed public key:  secp256k1(privKey, false)  → 65 bytes (0x04 || 64 raw)
    //   2. Strip prefix byte:        pub.slice(1)               → 64 raw bytes
    //   3. Hash the public key:      keccak256(64 bytes)        → 32 bytes
    //   4. Take the last 20 bytes:   hash.slice(12)             → 20-byte address
    //   5. EIP-55 checksum:          toChecksumAddress()
    const pub     = secp256k1.getPublicKey(this._priv, false); // uncompressed, 65 bytes
    const pubHash = keccak256Bytes(pub.slice(1));               // hash of 64-byte body
    this.address  = toChecksumAddress(bytesToHex(pubHash.slice(12)) as GhostAddress);
  }

  // ── Signing ────────────────────────────────────────────────────────────────

  async signHash(hash: Hex): Promise<Hex> {
    const hashBytes = hexToBytes(hash);
    if (hashBytes.length !== 32) {
      throw new GhostValidationError("GhostPrivateKeySigner.signHash: hash must be exactly 32 bytes");
    }
    const sig     = secp256k1.sign(hashBytes, this._priv, { lowS: true });
    const compact = sig.toCompactRawBytes();                    // 64 bytes: r(32) || s(32)
    const out     = new Uint8Array(65);
    out.set(compact, 0);
    out[64] = sig.recovery!;                                    // 0 or 1
    return bytesToHex(out);
  }

  async signMessage(message: string | Uint8Array): Promise<Hex> {
    const bytes = typeof message === "string"
      ? new TextEncoder().encode(message)
      : message;
    const prefix  = new TextEncoder().encode(`\x19GhostChain Signed Message:\n${bytes.length}`);
    const prefixed = new Uint8Array(prefix.length + bytes.length);
    prefixed.set(prefix, 0);
    prefixed.set(bytes, prefix.length);
    const digest  = keccak256Bytes(prefixed);
    return this.signHash(bytesToHex(digest));
  }

  async signTypedData(
    domain: Eip712Domain,
    types: Record<string, Eip712Type[]>,
    value: Record<string, unknown>,
  ): Promise<Hex> {
    // Encode EIP-712 structured data.
    const domainSep = _eip712DomainSeparator(domain);
    const typedHash = _eip712Hash(types, value);
    const payload   = new Uint8Array(66);
    payload[0]      = 0x19;
    payload[1]      = 0x01;
    payload.set(hexToBytes(domainSep), 2);
    payload.set(hexToBytes(typedHash), 34);
    const digest = keccak256Bytes(payload);
    return this.signHash(bytesToHex(digest));
  }

  async signTransaction(tx: GhostTxRequest): Promise<Hex> {
    GhostTransaction.assertEip1559Ready(tx);
    const unsigned = GhostTransaction.serializeUnsigned(tx);
    const digest   = keccak256Bytes(unsigned);
    const sig      = secp256k1.sign(digest, this._priv, { lowS: true });
    const compact  = sig.toCompactRawBytes();
    return GhostTransaction.serializeSigned(tx, {
      yParity: sig.recovery as 0 | 1,
      r: _pad32(compact.slice(0, 32)),
      s: _pad32(compact.slice(32, 64)),
    });
  }
}

// ── Internal EIP-712 helpers ──────────────────────────────────────────────────

function _pad32(b: Uint8Array): Uint8Array {
  if (b.length === 32) return b;
  const out = new Uint8Array(32);
  out.set(b, 32 - b.length);
  return out;
}

/** Encode and hash a single EIP-712 type + value. */
function _eip712Hash(
  types: Record<string, Eip712Type[]>,
  value: Record<string, unknown>,
): Hex {
  // Resolve the primary type (first key in the `types` map).
  const primaryType = Object.keys(types)[0];
  if (!primaryType) throw new GhostValidationError("signTypedData: types must have at least one entry");
  const fields = types[primaryType] ?? [];

  // Build typeHash = keccak256(encodeType)
  const encodeType = `${primaryType}(${fields.map(f => `${f.type} ${f.name}`).join(",")})`;
  const typeHash    = keccak256Bytes(new TextEncoder().encode(encodeType));

  // Build encodeData
  const encodedParts: Uint8Array[] = [typeHash];
  for (const field of fields) {
    const v = value[field.name];
    encodedParts.push(_encodeField(field.type, v));
  }
  const joined = _concat(encodedParts);
  return bytesToHex(keccak256Bytes(joined));
}

function _eip712DomainSeparator(domain: Eip712Domain): Hex {
  const fields: Eip712Type[] = [];
  const values: Record<string, unknown> = {};
  if (domain.name)              { fields.push({ name: "name",              type: "string"  }); values["name"]              = domain.name; }
  if (domain.version)           { fields.push({ name: "version",          type: "string"  }); values["version"]           = domain.version; }
  if (domain.chainId)           { fields.push({ name: "chainId",          type: "uint256" }); values["chainId"]           = domain.chainId; }
  if (domain.verifyingContract) { fields.push({ name: "verifyingContract", type: "address" }); values["verifyingContract"] = domain.verifyingContract; }
  if (domain.salt)              { fields.push({ name: "salt",             type: "bytes32" }); values["salt"]              = domain.salt; }
  return _eip712Hash({ EIP712Domain: fields }, values);
}

function _encodeField(type: string, value: unknown): Uint8Array {
  if (type === "string" || type === "bytes") {
    const bytes = type === "string"
      ? new TextEncoder().encode(String(value))
      : hexToBytes(String(value) as Hex);
    return keccak256Bytes(bytes);
  }
  if (type === "address") {
    const out = new Uint8Array(32);
    out.set(hexToBytes(String(value) as Hex), 12);
    return out;
  }
  if (type === "bool") {
    const out = new Uint8Array(32);
    out[31] = value ? 1 : 0;
    return out;
  }
  if (type.startsWith("uint") || type.startsWith("int")) {
    const n = BigInt(String(value));
    const out = new Uint8Array(32);
    let tmp = n;
    for (let i = 31; i >= 0 && tmp > 0n; i--) {
      out[i] = Number(tmp & 0xffn);
      tmp >>= 8n;
    }
    return out;
  }
  if (type === "bytes32") {
    const b = hexToBytes(String(value) as Hex);
    const out = new Uint8Array(32);
    out.set(b.slice(0, 32), 0);
    return out;
  }
  throw new GhostValidationError(`GhostPrivateKeySigner: unsupported EIP-712 type "${type}"`);
}

function _concat(parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((n, p) => n + p.length, 0);
  const out   = new Uint8Array(total);
  let offset  = 0;
  for (const p of parts) { out.set(p, offset); offset += p.length; }
  return out;
}
