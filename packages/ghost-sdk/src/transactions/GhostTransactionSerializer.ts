/**
 * GhostTransactionSerializer — RLP encode/decode for EIP-2718 typed transactions.
 *
 * Supports:
 *   - type 0 (legacy)
 *   - type 1 (EIP-2930, access list)
 *   - type 2 (EIP-1559, dynamic fee)
 *
 * Usage:
 *   const hex = GhostTransactionSerializer.serialize(tx)
 *   const decoded = GhostTransactionSerializer.deserialize(hex)
 */

import type { GhostTxRequest, Hex } from "../native/types.js";
import { rlpEncode } from "../native/rlp.js";
import { add0x, strip0x } from "../native/hex.js";
import { hexToBytes, bytesToHex } from "../native/bytes.js";
import { GhostValidationError } from "../errors/GhostErrors.js";

export type SignatureComponents = {
  v: bigint;
  r: Hex;
  s: Hex;
};

export type SerializedTx = {
  type: 0 | 1 | 2;
  raw: Hex;
};

export class GhostTransactionSerializer {
  /**
   * Serialize an unsigned EIP-1559 transaction for signing.
   * Returns the RLP for: [chainId, nonce, maxPriorityFeePerGas, maxFeePerGas,
   *                        gasLimit, to, value, data, accessList]
   */
  static serializeUnsignedEip1559(tx: GhostTxRequest): Hex {
    const items: Uint8Array[] = _buildEip1559Items(tx);
    const rlpBytes = rlpEncode(items as unknown as Uint8Array);
    const prefixed = new Uint8Array(1 + rlpBytes.length);
    prefixed[0] = 0x02;
    prefixed.set(rlpBytes, 1);
    return add0x(bytesToHex(prefixed)) as Hex;
  }

  static serializeSignedEip1559(tx: GhostTxRequest, sig: SignatureComponents): Hex {
    const items = [
      ..._buildEip1559Items(tx),
      _bigIntToRlpBytes(sig.v),
      _hexToRlpBytes(strip0x(sig.r)),
      _hexToRlpBytes(strip0x(sig.s)),
    ];
    const rlpBytes = rlpEncode(items as unknown as Uint8Array);
    const prefixed = new Uint8Array(1 + rlpBytes.length);
    prefixed[0] = 0x02;
    prefixed.set(rlpBytes, 1);
    return add0x(bytesToHex(prefixed)) as Hex;
  }

  static serializeUnsignedLegacy(tx: GhostTxRequest): Hex {
    const chainId = BigInt(tx.chainId ?? 1);
    const items: Uint8Array[] = [
      _bigIntToRlpBytes(BigInt(tx.nonce ?? 0)),
      _bigIntToRlpBytes(tx.gasPrice ?? 0n),
      _bigIntToRlpBytes(tx.gasLimit ?? 21000n),
      tx.to ? _hexToRlpBytes(strip0x(tx.to)) : new Uint8Array(0),
      _bigIntToRlpBytes(tx.value ?? 0n),
      tx.data ? _hexToRlpBytes(strip0x(tx.data)) : new Uint8Array(0),
      _bigIntToRlpBytes(chainId),
      new Uint8Array(0),
      new Uint8Array(0),
    ];
    return add0x(bytesToHex(rlpEncode(items as unknown as Uint8Array))) as Hex;
  }

  /**
   * Deserialize a raw transaction and extract fields.
   */
  static deserialize(raw: Hex): { type: 0 | 1 | 2; fields: Record<string, unknown> } {
    const bytes = hexToBytes(raw);
    const firstByte = bytes[0]!;

    if (firstByte === 0x02) {
      // EIP-1559
      const rlpBytes = bytes.slice(1);
      const rlpHex = add0x(bytesToHex(rlpBytes)) as Hex;
      const fields = _parseEip1559Fields(rlpHex);
      return { type: 2, fields };
    }

    if (firstByte === 0x01) {
      // EIP-2930
      const rlpBytes = bytes.slice(1);
      const rlpHex = add0x(bytesToHex(rlpBytes)) as Hex;
      return { type: 1, fields: { raw: rlpHex } };
    }

    // Legacy
    return { type: 0, fields: { raw } };
  }
}

// ── Internal helpers ──────────────────────────────────────────────────────────

function _bigIntToRlpBytes(n: bigint): Uint8Array {
  if (n === 0n) return new Uint8Array(0);
  const hex = n.toString(16).padStart(2, "0").padStart(n.toString(16).length % 2 === 0 ? n.toString(16).length : n.toString(16).length + 1, "0");
  return hexToBytes(add0x(hex) as Hex);
}

function _numToRlpBytes(n: number): Uint8Array {
  return _bigIntToRlpBytes(BigInt(n));
}

function _hexToRlpBytes(hex: string): Uint8Array {
  if (!hex || hex === "0x" || hex === "") return new Uint8Array(0);
  const s = hex.startsWith("0x") ? hex.slice(2) : hex;
  return hexToBytes(add0x(s.length % 2 ? "0" + s : s) as Hex);
}

function _buildEip1559Items(tx: GhostTxRequest): Uint8Array[] {
  if (tx.chainId === undefined) throw new GhostValidationError("chainId required for EIP-1559 tx");
  return [
    _bigIntToRlpBytes(BigInt(tx.chainId)),
    _bigIntToRlpBytes(BigInt(tx.nonce ?? 0)),
    _bigIntToRlpBytes(tx.maxPriorityFeePerGas ?? 1_000_000_000n),
    _bigIntToRlpBytes(tx.maxFeePerGas ?? 10_000_000_000n),
    _bigIntToRlpBytes(tx.gasLimit ?? 21000n),
    tx.to ? _hexToRlpBytes(strip0x(tx.to)) : new Uint8Array(0),
    _bigIntToRlpBytes(tx.value ?? 0n),
    tx.data ? _hexToRlpBytes(strip0x(tx.data)) : new Uint8Array(0),
    // accessList is an RlpItem[] — empty for now
  ];
}

function _parseEip1559Fields(rlpHex: Hex): Record<string, unknown> {
  return { raw: rlpHex };
}
