// ─────────────────────────────────────────────────────────────────────────────
// AbiCoder – ethers-compatible ABI encode/decode
// Wraps GhostAbiCoder and exposes the ethers v6 API surface.
// ─────────────────────────────────────────────────────────────────────────────

import { GhostAbiCoder } from "../abi/GhostAbiCoder";
import type { GhostABIFragment, GhostABIInput } from "../types";
import type { BytesLike } from "./types";
import { toHexString } from "./types";

export class AbiCoder {
  private _coder = new GhostAbiCoder();

  /** Singleton, matching ethers.AbiCoder.defaultAbiCoder() pattern. */
  static defaultAbiCoder(): AbiCoder {
    return new AbiCoder();
  }

  /**
   * Encode values according to the given ABI types.
   * @param types  e.g. ["uint256", "address", "bool"]
   * @param values matching values
   */
  encode(types: readonly string[], values: readonly unknown[]): string {
    const mutableValues = [...values];
    // Build a synthetic ABI fragment so GhostAbiCoder can process it
    const fragment: GhostABIFragment = {
      type: "function",
      name: "__encode__",
      inputs: types.map((t, i) => ({ name: `p${i}`, type: t })),
      outputs: []
    };
    // Strip the 4-byte selector (first 4 bytes = 8 hex chars + "0x" prefix)
    const full = this._coder.encodeFunctionCall(fragment, mutableValues);
    return "0x" + full.slice(10); // remove "0x" + 8 char selector
  }

  /**
   * Decode ABI-encoded data into an array of JS values.
   * Returns an array-like object with positional and named access.
   */
  decode(types: string[], data: BytesLike): ReadonlyArray<unknown> {
    const hex = toHexString(data).slice(2);
    const results: unknown[] = [];
    let offset = 0;
    for (const type of types) {
      const word = hex.slice(offset, offset + 64);
      results.push(this._decodeWord(word, type));
      offset += 64;
    }
    return results;
  }

  private _decodeWord(hex: string, type: string): unknown {
    if (type.startsWith("uint") || type.startsWith("int")) return BigInt("0x" + hex);
    if (type === "address") return "0x" + hex.slice(24);
    if (type === "bool") return hex.slice(63) === "1";
    if (type === "bytes32") return "0x" + hex;
    if (type === "string" || type === "bytes") {
      const len = parseInt(hex.slice(0, 64), 16);
      const data = hex.slice(64, 64 + len * 2);
      return Buffer.from(data, "hex").toString("utf8");
    }
    return "0x" + hex;
  }
}
