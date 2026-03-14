/**
 * GhostInterface — ABI-based encoder/decoder with full JSON ABI support.
 *
 * Handles function selectors, argument encoding, result decoding,
 * and event topic generation from standard Solidity ABI JSON.
 *
 * Usage:
 *   const iface = new GhostInterface(abi)
 *   const data  = iface.encodeFunctionData("transfer", [to, amount])
 *   const result = iface.decodeFunctionResult("balanceOf", callResult)
 *   const topic  = iface.getEventTopic("Transfer")
 */

import { functionSelector, encodeCall, decodeUint256, decodeAddress } from "../native/abi.js";
import { keccak256Utf8 } from "../native/keccak.js";
import { add0x, strip0x } from "../native/hex.js";
import type { Hex } from "../native/types.js";
import { GhostAbiError } from "../errors/GhostErrors.js";

export type AbiInput = { name: string; type: string; internalType?: string };
export type AbiOutput = { name: string; type: string; internalType?: string };

export type AbiFunctionFragment = {
  type: "function";
  name: string;
  inputs: AbiInput[];
  outputs: AbiOutput[];
  stateMutability: "pure" | "view" | "nonpayable" | "payable";
};

export type AbiEventFragment = {
  type: "event";
  name: string;
  inputs: Array<AbiInput & { indexed: boolean }>;
  anonymous: boolean;
};

export type AbiFragment = AbiFunctionFragment | AbiEventFragment | {
  type: "constructor" | "fallback" | "receive" | "error";
  name?: string;
  inputs?: AbiInput[];
};

type DecodedOutput = bigint | string | boolean | Hex;

export class GhostInterface {
  private readonly functions: Map<string, AbiFunctionFragment> = new Map();
  private readonly events: Map<string, AbiEventFragment> = new Map();

  constructor(abi: AbiFragment[]) {
    for (const fragment of abi) {
      if (fragment.type === "function") {
        const f = fragment as AbiFunctionFragment;
        this.functions.set(f.name, f);
      } else if (fragment.type === "event") {
        const e = fragment as AbiEventFragment;
        this.events.set(e.name, e);
      }
    }
  }

  // ── Functions ─────────────────────────────────────────────────────────────

  encodeFunctionData(name: string, args: unknown[]): Hex {
    const fn = this._getFunction(name);
    const sig = `${fn.name}(${fn.inputs.map(i => i.type).join(",")})`;
    const types = fn.inputs.map(i => i.type as "uint256" | "address" | "bool" | "bytes32" | "bytes" | "string");
    return encodeCall(sig, types, args);
  }

  decodeFunctionResult(name: string, data: Hex): DecodedOutput[] {
    const fn = this._getFunction(name);
    const s = strip0x(data);
    const results: DecodedOutput[] = [];
    for (let i = 0; i < fn.outputs.length; i++) {
      const word = add0x(s.slice(i * 64, (i + 1) * 64)) as Hex;
      results.push(this._decodeWord(fn.outputs[i]!.type, word));
    }
    return results;
  }

  getFunctionSelector(name: string): Hex {
    const fn = this._getFunction(name);
    const sig = `${fn.name}(${fn.inputs.map(i => i.type).join(",")})`;
    return functionSelector(sig);
  }

  // ── Events ────────────────────────────────────────────────────────────────

  getEventTopic(name: string): Hex {
    const ev = this._getEvent(name);
    const sig = `${ev.name}(${ev.inputs.map(i => i.type).join(",")})`;
    return add0x(keccak256Utf8(sig).startsWith("0x") ? keccak256Utf8(sig).slice(2) : keccak256Utf8(sig)) as Hex;
  }

  decodeEventLog(name: string, topics: Hex[], data: Hex): Record<string, DecodedOutput> {
    const ev = this._getEvent(name);
    const result: Record<string, DecodedOutput> = {};
    const indexed = ev.inputs.filter(i => i.indexed);
    const nonIndexed = ev.inputs.filter(i => !i.indexed);

    // topics[0] is the event signature — skip it
    const topicData = topics.slice(1);
    for (let i = 0; i < indexed.length; i++) {
      const input = indexed[i]!;
      const word = topicData[i] ?? "0x" + "0".repeat(64) as Hex;
      result[input.name] = this._decodeWord(input.type, word as Hex);
    }

    const s = strip0x(data);
    for (let i = 0; i < nonIndexed.length; i++) {
      const input = nonIndexed[i]!;
      const word = add0x(s.slice(i * 64, (i + 1) * 64)) as Hex;
      result[input.name] = this._decodeWord(input.type, word);
    }

    return result;
  }

  // ── Internal ──────────────────────────────────────────────────────────────

  private _getFunction(name: string): AbiFunctionFragment {
    const fn = this.functions.get(name);
    if (!fn) throw new GhostAbiError(`Function not found in ABI: ${name}`);
    return fn;
  }

  private _getEvent(name: string): AbiEventFragment {
    const ev = this.events.get(name);
    if (!ev) throw new GhostAbiError(`Event not found in ABI: ${name}`);
    return ev;
  }

  private _decodeWord(type: string, word: Hex): DecodedOutput {
    if (type === "uint256" || type.startsWith("uint")) return decodeUint256(word);
    if (type === "address") return decodeAddress(word);
    if (type === "bool") return decodeUint256(word) !== 0n;
    if (type === "bytes32") return word;
    return word;
  }
}
