/**
 * @ghostchain/ghostchainjs-tx — EIP-1559 (type 2) Fee Market transaction
 *
 * Drop-in for @ethereumjs/tx FeeMarketEIP1559Transaction.
 * Zero ethers dependency.
 */

import type { FeeMarketEIP1559TxData, TxOptions, HexString, AccessList } from "./types.js";
import {
  toBigInt, toBytes, bigIntToBytes, toAddressBytes, bytesToHex,
  keccak256, rlpEncode, ecSign, encodeAccessList,
} from "./_utils.js";

const TX_TYPE = 0x02;

export class FeeMarketEIP1559Transaction {
  readonly chainId:              bigint;
  readonly nonce:                bigint;
  readonly maxPriorityFeePerGas: bigint;
  readonly maxFeePerGas:         bigint;
  readonly gasLimit:             bigint;
  readonly to:                   HexString | null;
  readonly value:                bigint;
  readonly data:                 Uint8Array;
  readonly accessList:           AccessList;
  readonly v:                    bigint;
  readonly r:                    Uint8Array;
  readonly s:                    Uint8Array;

  private constructor(
    data: FeeMarketEIP1559TxData,
    signed?: { v: bigint; r: Uint8Array; s: Uint8Array },
  ) {
    this.chainId              = toBigInt(data.chainId);
    this.nonce                = toBigInt(data.nonce);
    this.maxPriorityFeePerGas = toBigInt(data.maxPriorityFeePerGas);
    this.maxFeePerGas         = toBigInt(data.maxFeePerGas);
    this.gasLimit             = toBigInt(data.gasLimit);
    this.to                   = data.to ?? null;
    this.value                = toBigInt(data.value);
    this.data                 = toBytes(data.data);
    this.accessList           = data.accessList ?? [];
    if (signed) {
      this.v = signed.v; this.r = signed.r; this.s = signed.s;
    } else if (data.v !== undefined) {
      this.v = toBigInt(data.v); this.r = toBytes(data.r); this.s = toBytes(data.s);
    } else {
      this.v = 0n; this.r = new Uint8Array(0); this.s = new Uint8Array(0);
    }
    Object.freeze(this);
  }

  static fromTxData(data: FeeMarketEIP1559TxData, _opts?: TxOptions): FeeMarketEIP1559Transaction {
    return new FeeMarketEIP1559Transaction(data);
  }

  getHashedMsg(): Uint8Array {
    const payload = this._signingPayload();
    const prefixed = new Uint8Array([TX_TYPE, ...payload]);
    return keccak256(prefixed);
  }

  sign(privateKey: Uint8Array): FeeMarketEIP1559Transaction {
    const { v, r, s } = ecSign(this.getHashedMsg(), privateKey);
    return new FeeMarketEIP1559Transaction(this._toData(), { v, r, s });
  }

  serialize(): Uint8Array {
    const fields = [
      bigIntToBytes(this.chainId),
      bigIntToBytes(this.nonce),
      bigIntToBytes(this.maxPriorityFeePerGas),
      bigIntToBytes(this.maxFeePerGas),
      bigIntToBytes(this.gasLimit),
      toAddressBytes(this.to as HexString),
      bigIntToBytes(this.value),
      this.data,
      encodeAccessList(this.accessList),
      bigIntToBytes(this.v),
      this.r,
      this.s,
    ];
    const encoded = rlpEncode(fields) as unknown as Uint8Array;
    return new Uint8Array([TX_TYPE, ...encoded]);
  }

  hash(): Uint8Array {
    return keccak256(this.serialize());
  }

  isSigned(): boolean {
    return this.r.length > 0 && this.s.length > 0;
  }

  toJSON(): Record<string, unknown> {
    return {
      chainId:              "0x" + this.chainId.toString(16),
      nonce:                "0x" + this.nonce.toString(16),
      maxPriorityFeePerGas: "0x" + this.maxPriorityFeePerGas.toString(16),
      maxFeePerGas:         "0x" + this.maxFeePerGas.toString(16),
      gasLimit:             "0x" + this.gasLimit.toString(16),
      to:                   this.to ?? "0x",
      value:                "0x" + this.value.toString(16),
      data:                 bytesToHex(this.data),
      accessList:           this.accessList,
      v:                    "0x" + this.v.toString(16),
      r:                    bytesToHex(this.r),
      s:                    bytesToHex(this.s),
    };
  }

  private _signingPayload(): Uint8Array {
    const fields = [
      bigIntToBytes(this.chainId),
      bigIntToBytes(this.nonce),
      bigIntToBytes(this.maxPriorityFeePerGas),
      bigIntToBytes(this.maxFeePerGas),
      bigIntToBytes(this.gasLimit),
      toAddressBytes(this.to as HexString),
      bigIntToBytes(this.value),
      this.data,
      encodeAccessList(this.accessList),
    ];
    return new Uint8Array(rlpEncode(fields) as unknown as ArrayBuffer);
  }

  private _toData(): FeeMarketEIP1559TxData {
    return {
      chainId: this.chainId, nonce: this.nonce,
      maxPriorityFeePerGas: this.maxPriorityFeePerGas, maxFeePerGas: this.maxFeePerGas,
      gasLimit: this.gasLimit, to: this.to as HexString,
      value: this.value, data: this.data, accessList: this.accessList,
    };
  }
}
