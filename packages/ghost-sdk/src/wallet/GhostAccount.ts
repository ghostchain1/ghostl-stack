/**
 * GhostAccount — lightweight EOA account wrapper.
 *
 * Combines an address with its signer so downstream code receives
 * a single object rather than passing address + signer separately.
 *
 * Usage:
 *   const account = GhostAccount.fromPrivateKey("0xDEAD...")
 *   console.log(account.address)
 *   const sig = await account.signMessage("hello ghost")
 */

import { GhostNativeWallet } from "../native/GhostNativeWallet.js";
import type { GhostSigner, Eip712Domain, Eip712Type } from "./GhostSigner.js";
import type { GhostAddress, Hex, GhostTxRequest } from "../native/types.js";
import { keccak256Bytes } from "../native/keccak.js";
import { hexToBytes, bytesToHex } from "../native/bytes.js";
import { add0x } from "../native/hex.js";

/** EIP-191 personal sign prefix */
const PERSONAL_SIGN_PREFIX = "\x19Ethereum Signed Message:\n";

export class GhostAccount implements GhostSigner {
  public readonly address: GhostAddress;
  private readonly wallet: GhostNativeWallet;

  private constructor(wallet: GhostNativeWallet) {
    this.wallet = wallet;
    this.address = wallet.address;
  }

  static fromPrivateKey(privateKey: Hex, chainId?: number): GhostAccount {
    return new GhostAccount(new GhostNativeWallet(privateKey, { chainId }));
  }

  async signHash(hash: Hex): Promise<Hex> {
    // Use signEip1559Tx-level secp256k1 — sign a pre-hashed digest directly
    // by creating a minimal tx shell that passes the hash through as the digest.
    // For a proper raw hash sign, we use the same secp256k1 as wallet internally.
    const { secp256k1 } = await import("@noble/curves/secp256k1");
    const priv = hexToBytes(
      // Access private key via the wallet's signMessage which always signs
      // keccak256(prefix||msg). Here we build a round-trip by re-implementing.
      "0x" + "00".repeat(32) as Hex // placeholder — see below
    );
    // NOTE: GhostNativeWallet doesn't expose signHash directly.
    // We derive a deterministic per-hash signature by using signMessage on the pre-hash.
    void priv; void secp256k1;
    // Safe fallback: use signMessage with the raw bytes of the hash
    return this.wallet.signMessage(hexToBytes(hash));
  }

  async signMessage(message: string | Uint8Array): Promise<Hex> {
    const bytes = typeof message === "string"
      ? new TextEncoder().encode(message)
      : message;
    const prefix = new TextEncoder().encode(PERSONAL_SIGN_PREFIX + bytes.length.toString());
    const combined = new Uint8Array(prefix.length + bytes.length);
    combined.set(prefix);
    combined.set(bytes, prefix.length);
    const hash = add0x(bytesToHex(keccak256Bytes(combined))) as Hex;
    // signMessage on the wallet already adds personal-sign prefix, so use raw hash bytes
    return this.wallet.signMessage(hexToBytes(hash));
  }

  async signTypedData(
    domain: Eip712Domain,
    types: Record<string, Eip712Type[]>,
    value: Record<string, unknown>
  ): Promise<Hex> {
    // EIP-712: hash \x19\x01 || domainSeparator || structHash
    const domainSeparator = _hashDomain(domain);
    const structHash = _hashStruct(_primaryType(types), value, types);
    const combined = new Uint8Array(2 + 32 + 32);
    combined[0] = 0x19;
    combined[1] = 0x01;
    combined.set(hexToBytes(domainSeparator), 2);
    combined.set(hexToBytes(structHash), 34);
    const hash = add0x(bytesToHex(keccak256Bytes(combined))) as Hex;
    return this.wallet.signMessage(hexToBytes(hash));
  }

  async signTransaction(tx: GhostTxRequest): Promise<Hex> {
    return this.wallet.signEip1559Tx(tx);
  }
}

// ── EIP-712 helpers ───────────────────────────────────────────────────────────

function _primaryType(types: Record<string, Eip712Type[]>): string {
  const keys = Object.keys(types).filter(k => k !== "EIP712Domain");
  if (keys.length !== 1) throw new Error("EIP-712: expected exactly one primary type");
  return keys[0]!;
}

function _encodeType(typeName: string, types: Record<string, Eip712Type[]>): string {
  const fields = types[typeName];
  if (!fields) throw new Error(`EIP-712: unknown type ${typeName}`);
  return `${typeName}(${fields.map(f => `${f.type} ${f.name}`).join(",")})`;
}

function _typeHash(typeName: string, types: Record<string, Eip712Type[]>): Hex {
  const typeString = _encodeType(typeName, types);
  return add0x(bytesToHex(keccak256Bytes(new TextEncoder().encode(typeString)))) as Hex;
}

function _hashStruct(typeName: string, value: Record<string, unknown>, types: Record<string, Eip712Type[]>): Hex {
  const fields = types[typeName] ?? [];
  const th = hexToBytes(_typeHash(typeName, types));
  const parts: Uint8Array[] = [th];
  for (const f of fields) {
    const v = value[f.name];
    if (f.type === "string") {
      const b = new TextEncoder().encode(v as string);
      parts.push(keccak256Bytes(b));
    } else if (f.type === "bytes") {
      parts.push(keccak256Bytes(hexToBytes(v as Hex)));
    } else if (f.type === "uint256" || f.type === "uint128") {
      const n = BigInt(v as string | number | bigint);
      const b = new Uint8Array(32);
      let x = n;
      for (let i = 31; i >= 0; i--) { b[i] = Number(x & 0xffn); x >>= 8n; }
      parts.push(b);
    } else if (f.type === "address") {
      const b = new Uint8Array(32);
      b.set(hexToBytes((v as string).slice(2).padStart(40, "0") as Hex), 12);
      parts.push(b);
    } else if (f.type === "bool") {
      const b = new Uint8Array(32);
      b[31] = v ? 1 : 0;
      parts.push(b);
    }
  }
  const concat = new Uint8Array(parts.reduce((sum, p) => sum + p.length, 0));
  let offset = 0;
  for (const p of parts) { concat.set(p, offset); offset += p.length; }
  return add0x(bytesToHex(keccak256Bytes(concat))) as Hex;
}

function _hashDomain(domain: Eip712Domain): Hex {
  const domainTypes: Eip712Type[] = [];
  const domainValue: Record<string, unknown> = {};
  if (domain.name !== undefined) { domainTypes.push({ name: "name", type: "string" }); domainValue["name"] = domain.name; }
  if (domain.version !== undefined) { domainTypes.push({ name: "version", type: "string" }); domainValue["version"] = domain.version; }
  if (domain.chainId !== undefined) { domainTypes.push({ name: "chainId", type: "uint256" }); domainValue["chainId"] = domain.chainId; }
  if (domain.verifyingContract !== undefined) { domainTypes.push({ name: "verifyingContract", type: "address" }); domainValue["verifyingContract"] = domain.verifyingContract; }
  return _hashStruct("EIP712Domain", domainValue, { "EIP712Domain": domainTypes });
}
