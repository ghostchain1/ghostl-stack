/**
 * GhostAbiDecoder
 *
 * Decode raw eth_call / getTransactionReceipt return data into
 * structured JavaScript values, using native/abi.ts primitives.
 *
 * Usage:
 *   const decoder = new GhostAbiDecoder();
 *   const balance = decoder.decodeUint256(callResult);
 *   const addr    = decoder.decodeAddress(callResult);
 *
 *   // Multi-value decode
 *   const [owner, amount] = decoder.decode(["address", "uint256"], data);
 */

import { decodeUint256, decodeAddress } from "../native/abi.js";
import { GhostAbiError } from "../errors/GhostErrors.js";
import type { Hex, GhostAddress } from "../native/types.js";

// ── Types ──────────────────────────────────────────────────────────────────────

export type DecodedValue = bigint | string | boolean | Hex;
export type AbiOutputType = "uint256" | "address" | "bool" | "bytes32" | "bytes" | "string";

// ── GhostAbiDecoder ────────────────────────────────────────────────────────────

export class GhostAbiDecoder {

  /** Decode a single uint256 from a padded 32-byte hex word. */
  decodeUint256(hex: Hex): bigint {
    return decodeUint256(hex);
  }

  /** Decode a single address from a padded 32-byte hex word. */
  decodeAddress(hex: Hex): GhostAddress {
    return decodeAddress(hex);
  }

  /** Decode a single bool from a padded 32-byte hex word. */
  decodeBool(hex: Hex): boolean {
    return decodeUint256(hex) !== 0n;
  }

  /** Decode a bytes32 value (raw 32 bytes as hex). */
  decodeBytes32(hex: Hex): Hex {
    const s = hex.slice(2); // strip 0x
    if (s.length < 64) throw new GhostAbiError("bytes32 word too short");
    return `0x${s.slice(0, 64)}` as Hex;
  }

  /**
   * Decode ABI-encoded output for a list of types.
   *
   * Only handles static types in this lightweight implementation.
   * For complex dynamic types, use the full ethers AbiCoder.
   *
   * @param types - array of output types, e.g. ["uint256", "address", "bool"]
   * @param hex   - raw hex returned from eth_call (including leading 0x)
   */
  decode(types: AbiOutputType[], hex: Hex): DecodedValue[] {
    const data   = hex.startsWith("0x") ? hex.slice(2) : hex;
    const words  = _splitWords(data);
    const result: DecodedValue[] = [];

    if (words.length < types.length) {
      throw new GhostAbiError(`Expected ${types.length} ABI words, got ${words.length}`);
    }

    for (let i = 0; i < types.length; i++) {
      const word = words[i]!;
      const type = types[i]!;

      switch (type) {
        case "uint256":  result.push(decodeUint256(`0x${word}`)); break;
        case "address":  result.push(decodeAddress(`0x${word}`)); break;
        case "bool":     result.push(decodeUint256(`0x${word}`) !== 0n); break;
        case "bytes32":  result.push(`0x${word}` as Hex); break;
        // Dynamic types — return offset placeholder for now
        case "bytes":
        case "string":
          result.push(`0x${word}` as Hex); break;
        default:
          throw new GhostAbiError(`Unsupported decode type: ${type}`);
      }
    }

    return result;
  }

  // ── GRC20 convenience decoders ─────────────────────────────────────────────

  /** Decode a GRC20 `balanceOf` or `allowance` call result. */
  decodeBalance(hex: Hex): bigint { return this.decodeUint256(hex); }

  /** Decode a GRC20 `decimals()` call result. */
  decodeDecimals(hex: Hex): number { return Number(this.decodeUint256(hex)); }

  /** Decode a GRC20 `totalSupply()` call result. */
  decodeTotalSupply(hex: Hex): bigint { return this.decodeUint256(hex); }
}

// ── Internal ───────────────────────────────────────────────────────────────────

function _splitWords(data: string): string[] {
  const words: string[] = [];
  for (let i = 0; i < data.length; i += 64) {
    words.push(data.slice(i, i + 64).padStart(64, "0"));
  }
  return words;
}

/** Default singleton instance */
export const ghostAbiDecoder = new GhostAbiDecoder();
