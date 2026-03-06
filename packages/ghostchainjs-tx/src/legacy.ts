/**
 * @ghostchain/ghostchainjs-tx — Legacy (type 0) transaction
 *
 * Implements Legacy / EIP-155 transaction encoding and signing.
 * GhostChain drop-in for @ethereumjs/tx LegacyTransaction. // brand-enforcer-ignore
 * Zero ethers dependency.
 */

import type { LegacyTxData, TxOptions, SignedTxResult, HexString } from "./types.js";
import {
  toBigInt, toBytes, bigIntToBytes, toAddressBytes, bytesToHex,
  keccak256, rlpEncode, ecSign,
} from "./_utils.js";

export class LegacyTransaction {
  readonly nonce:    bigint;
  readonly gasPrice: bigint;
  readonly gasLimit: bigint;
  readonly to:       HexString | null;
  readonly value:    bigint;
  readonly data:     Uint8Array;
  readonly chainId:  bigint;
  /** Only set after signing */
  readonly v:        bigint;
  readonly r:        Uint8Array;
  readonly s:        Uint8Array;

  private constructor(data: LegacyTxData, signed?: { v: bigint; r: Uint8Array; s: Uint8Array }) {
    this.nonce    = toBigInt(data.nonce);
    this.gasPrice = toBigInt(data.gasPrice);
    this.gasLimit = toBigInt(data.gasLimit);
    this.to       = data.to ?? null;
    this.value    = toBigInt(data.value);
    this.data     = toBytes(data.data);
    this.chainId  = toBigInt(data.chainId);
    if (signed) {
      this.v = signed.v;
      this.r = signed.r;
      this.s = signed.s;
    } else if (data.v !== undefined) {
      this.v = toBigInt(data.v);
      this.r = toBytes(data.r);
      this.s = toBytes(data.s);
    } else {
      this.v = 0n;
      this.r = new Uint8Array(0);
      this.s = new Uint8Array(0);
    }
    Object.freeze(this);
  }

  /** Create a LegacyTransaction from plain-object data */
  static fromTxData(data: LegacyTxData, _opts?: TxOptions): LegacyTransaction {
    return new LegacyTransaction(data);
  }

  /** Create a LegacyTransaction from a serialized RLP buffer */
  static fromSerializedTx(serialized: Uint8Array, _opts?: TxOptions): LegacyTransaction {
    // Minimal decode: just re-wrap; full decode left for future
    throw new Error("GhostTx: LegacyTransaction.fromSerializedTx not yet implemented");
  }

  /** Return the signing hash (EIP-155 if chainId is set, else pre-155) */
  getHashedMsg(): Uint8Array {
    const fields = this._signingFields();
    const encoded = rlpEncode(fields);
    return keccak256(new Uint8Array(encoded as unknown as ArrayBuffer));
  }

  /** Sign this transaction with a private key; returns a new signed instance */
  sign(privateKey: Uint8Array): LegacyTransaction {
    const msgHash = this.getHashedMsg();
    const { v: rawV, r, s } = ecSign(msgHash, privateKey);
    // EIP-155 v encoding
    const v = this.chainId > 0n ? rawV + 2n * this.chainId + 35n : rawV + 27n;
    return new LegacyTransaction(this._toData(), { v, r, s });
  }

  /** RLP-encode the signed transaction */
  serialize(): Uint8Array {
    const fields = [
      bigIntToBytes(this.nonce),
      bigIntToBytes(this.gasPrice),
      bigIntToBytes(this.gasLimit),
      toAddressBytes(this.to as HexString),
      bigIntToBytes(this.value),
      this.data,
      bigIntToBytes(this.v),
      this.r,
      this.s,
    ];
    return new Uint8Array(rlpEncode(fields) as unknown as ArrayBuffer);
  }

  /** Keccak-256 hash of the serialized (signed) transaction */
  hash(): Uint8Array {
    return keccak256(this.serialize());
  }

  isSigned(): boolean {
    return this.r.length > 0 && this.s.length > 0;
  }

  toJSON(): Record<string, string> {
    return {
      nonce:    "0x" + this.nonce.toString(16),
      gasPrice: "0x" + this.gasPrice.toString(16),
      gasLimit: "0x" + this.gasLimit.toString(16),
      to:       this.to ?? "0x",
      value:    "0x" + this.value.toString(16),
      data:     bytesToHex(this.data),
      v:        "0x" + this.v.toString(16),
      r:        bytesToHex(this.r),
      s:        bytesToHex(this.s),
    };
  }

  // ── Private ─────────────────────────────────────────────────────────────────

  private _signingFields(): unknown[] {
    if (this.chainId > 0n) {
      // EIP-155
      return [
        bigIntToBytes(this.nonce),
        bigIntToBytes(this.gasPrice),
        bigIntToBytes(this.gasLimit),
        toAddressBytes(this.to as HexString),
        bigIntToBytes(this.value),
        this.data,
        bigIntToBytes(this.chainId),
        new Uint8Array(0),
        new Uint8Array(0),
      ];
    }
    // Pre-EIP-155
    return [
      bigIntToBytes(this.nonce),
      bigIntToBytes(this.gasPrice),
      bigIntToBytes(this.gasLimit),
      toAddressBytes(this.to as HexString),
      bigIntToBytes(this.value),
      this.data,
    ];
  }

  private _toData(): LegacyTxData {
    return {
      nonce:    this.nonce,
      gasPrice: this.gasPrice,
      gasLimit: this.gasLimit,
      to:       this.to as HexString,
      value:    this.value,
      data:     this.data,
      chainId:  this.chainId,
    };
  }
}

/** Alias matching @ethereumjs/tx export name */ // brand-enforcer-ignore
export { LegacyTransaction as Transaction };
