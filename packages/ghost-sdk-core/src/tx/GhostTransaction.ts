// ─────────────────────────────────────────────────────────────────────────────
// GhostTransaction – Real EIP-1559 (Type 2) Transaction with RLP Serialization
//
// Signing hash  = keccak256(0x02 || rlp([chainId, nonce, maxPriorityFeePerGas,
//                                         maxFeePerGas, gasLimit, to, value,
//                                         data, accessList]))
//
// Signed raw tx = 0x02 || rlp([chainId, nonce, maxPriorityFeePerGas,
//                               maxFeePerGas, gasLimit, to, value, data,
//                               accessList, v, r, s])
// ─────────────────────────────────────────────────────────────────────────────

import { rlpEncode } from "../rlp/rlp";
import { keccak256 } from "../crypto/keccak";

/** EIP-2930 access list entry */
export interface AccessListEntry {
  address: string;
  storageKeys: string[];
}

export type AccessList = AccessListEntry[];

function encodeAccessList(list: AccessList): unknown[] {
  return list.map(({ address, storageKeys }) => [
    addressToBytes(address),
    storageKeys.map((k) => hexToBytes32(k))
  ]);
}

function addressToBytes(addr: string): Uint8Array {
  const hex = addr.startsWith("0x") ? addr.slice(2) : addr;
  return Uint8Array.from(Buffer.from(hex.padStart(40, "0"), "hex"));
}

function hexToBytes32(key: string): Uint8Array {
  const hex = key.startsWith("0x") ? key.slice(2) : key;
  return Uint8Array.from(Buffer.from(hex.padStart(64, "0"), "hex"));
}

function encodeTo(to?: string): Uint8Array {
  if (!to) return new Uint8Array(0);
  return addressToBytes(to);
}

export class GhostTransaction {
  // ── EIP-1559 fields ───────────────────────────────────────────────────────
  chainId!: number;
  nonce!: number;
  maxPriorityFeePerGas!: bigint;
  maxFeePerGas!: bigint;
  gasLimit!: bigint;
  to?: string;
  value: bigint = 0n;
  data: string = "0x";
  accessList: AccessList = [];

  // ── Legacy / informational ────────────────────────────────────────────────
  gasPrice?: bigint;
  from?: string;

  /**
   * Returns keccak256(0x02 || rlp(unsignedFields)).
   * This 32-byte digest is what gets signed.
   */
  signingHash(): Uint8Array {
    const encoded = rlpEncode(this._unsignedRlpFields() as any);
    const prefixed = new Uint8Array([0x02, ...encoded]);
    return keccak256(prefixed);
  }

  /** Returns 0x02 || rlp(unsignedFields) as bytes. */
  serialize(): Uint8Array {
    const encoded = rlpEncode(this._unsignedRlpFields() as any);
    return new Uint8Array([0x02, ...encoded]);
  }

  /**
   * Returns the fully signed raw transaction hex string.
   * @param v   recovery bit: 0 or 1 (EIP-1559 — NOT 27/28)
   * @param r   32-byte r component
   * @param s   32-byte s component
   */
  encodeSigned(v: number, r: Uint8Array, s: Uint8Array): string {
    const fields = [
      ...this._unsignedRlpFields(),
      BigInt(v),
      _stripLeadingZeros(r),
      _stripLeadingZeros(s)
    ];
    const encoded = rlpEncode(fields as any);
    const raw = new Uint8Array([0x02, ...encoded]);
    return "0x" + Buffer.from(raw).toString("hex");
  }

  private _unsignedRlpFields(): unknown[] {
    const dataBytes =
      this.data === "0x" || this.data === ""
        ? new Uint8Array(0)
        : Uint8Array.from(Buffer.from(this.data.replace("0x", ""), "hex"));

    return [
      BigInt(this.chainId),
      BigInt(this.nonce),
      this.maxPriorityFeePerGas,
      this.maxFeePerGas,
      this.gasLimit,
      encodeTo(this.to),
      this.value,
      dataBytes,
      encodeAccessList(this.accessList)
    ];
  }
}

function _stripLeadingZeros(bytes: Uint8Array): Uint8Array {
  let i = 0;
  while (i < bytes.length - 1 && bytes[i] === 0) i++;
  return bytes.slice(i);
}

// ─── Per-layer factory helpers ────────────────────────────────────────────────

export function makeL1Transaction(fields: Partial<GhostTransaction>): GhostTransaction {
  return _make(31337, fields);
}

export function makeL2Transaction(fields: Partial<GhostTransaction>): GhostTransaction {
  return _make(42069, fields);
}

export function makeL3Transaction(fields: Partial<GhostTransaction>): GhostTransaction {
  return _make(43069, fields);
}

function _make(chainId: number, fields: Partial<GhostTransaction>): GhostTransaction {
  const tx = new GhostTransaction();
  tx.chainId = chainId;
  tx.nonce = fields.nonce ?? 0;
  tx.maxPriorityFeePerGas = fields.maxPriorityFeePerGas ?? 1_000_000_000n;
  tx.maxFeePerGas = fields.maxFeePerGas ?? 2_000_000_000n;
  tx.gasLimit = fields.gasLimit ?? 21_000n;
  tx.to = fields.to;
  tx.value = fields.value ?? 0n;
  tx.data = fields.data ?? "0x";
  tx.accessList = fields.accessList ?? [];
  tx.from = fields.from;
  return tx;
}
