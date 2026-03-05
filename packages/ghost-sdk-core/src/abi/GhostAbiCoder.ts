// ─────────────────────────────────────────────────────────────────────────────
// GhostAbiCoder – ABI encoding / decoding (replaces ethers AbiCoder)
// ─────────────────────────────────────────────────────────────────────────────
import { keccak256Hex } from "../crypto/keccak";
import { GhostABIError } from "../errors";
import type { GhostABIFragment } from "../types";

export class GhostAbiCoder {
  /**
   * Compute the 4-byte function selector for `name(type,type,...)`.
   */
  encodeFunctionSelector(fragment: GhostABIFragment): string {
    const sig = `${fragment.name}(${(fragment.inputs ?? []).map((i) => i.type).join(",")})`;
    return keccak256Hex(new TextEncoder().encode(sig)).slice(0, 10); // "0x" + 8 hex chars
  }

  /**
   * Encode a function call: selector + ABI-encoded params.
   * NOTE: This is a simplified encoder that handles primitive uint/address/bytes32/bool/string.
   * For full tuple / dynamic array support, extend pad32() below.
   */
  encodeFunctionCall(fragment: GhostABIFragment, params: unknown[]): string {
    const selector = this.encodeFunctionSelector(fragment);
    const encoded = params.map((p, i) => this.encode(p, (fragment.inputs ?? [])[i]?.type ?? "bytes32"));
    return selector + encoded.join("");
  }

  /**
   * Decode the result bytes from an eth_call into a usable value.
   * Returns the first output for single-value results.
   */
  decodeFunctionResult(fragment: GhostABIFragment, hex: string): unknown {
    const outputs = fragment.outputs ?? [];
    if (outputs.length === 0) return undefined;
    const data = hex.startsWith("0x") ? hex.slice(2) : hex;
    return this.decode(data, outputs[0].type);
  }

  /**
   * Compute the event topic0 (keccak256 of the event signature).
   */
  encodeEventTopic(fragment: GhostABIFragment): string {
    const sig = `${fragment.name}(${(fragment.inputs ?? []).map((i) => i.type).join(",")})`;
    return keccak256Hex(new TextEncoder().encode(sig));
  }

  // ─── Internal helpers ──────────────────────────────────────────────────────

  private encode(value: unknown, type: string): string {
    if (type.startsWith("uint") || type.startsWith("int")) {
      return BigInt(value as bigint | number | string)
        .toString(16)
        .padStart(64, "0");
    }
    if (type === "address") {
      const addr = (value as string).toLowerCase().replace("0x", "");
      return addr.padStart(64, "0");
    }
    if (type === "bool") {
      return (value ? "1" : "0").padStart(64, "0");
    }
    if (type === "bytes32") {
      const hex = (value as string).replace("0x", "");
      return hex.padEnd(64, "0");
    }
    if (type === "string" || type === "bytes") {
      const bytes = new TextEncoder().encode(value as string);
      const lenHex = bytes.length.toString(16).padStart(64, "0");
      const dataHex = Array.from(bytes)
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("")
        .padEnd(Math.ceil(bytes.length / 32) * 64, "0");
      return lenHex + dataHex;
    }
    throw new GhostABIError(`Unsupported ABI type: ${type}`);
  }

  private decode(hex: string, type: string): unknown {
    if (type.startsWith("uint") || type.startsWith("int")) {
      return BigInt("0x" + hex.slice(0, 64));
    }
    if (type === "address") {
      return "0x" + hex.slice(24, 64);
    }
    if (type === "bool") {
      return hex.slice(63, 64) === "1";
    }
    if (type === "bytes32") {
      return "0x" + hex.slice(0, 64);
    }
    if (type === "string" || type === "bytes") {
      const len = parseInt(hex.slice(0, 64), 16);
      const data = hex.slice(64, 64 + len * 2);
      const bytes = new Uint8Array(data.match(/.{2}/g)!.map((b) => parseInt(b, 16)));
      return new TextDecoder().decode(bytes);
    }
    return hex;
  }
}
