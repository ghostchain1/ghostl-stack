// ─────────────────────────────────────────────────────────────────────────────
// Interface – ethers-compatible contract interface
// Wraps GhostAbiCoder + GhostEventDecoder and exposes the ethers v6 API.
// ─────────────────────────────────────────────────────────────────────────────

import { GhostAbiCoder } from "../abi/GhostAbiCoder";
import { GhostEventDecoder } from "../abi/GhostEventDecoder";
import type { GhostABIFragment, GhostLog } from "../types";
import { GhostABIError } from "../errors";
import { AbiCoder } from "./AbiCoder";
import type { BytesLike } from "./types";
import { toHexString } from "./types";

export type JsonFragment = GhostABIFragment;

export interface FunctionFragment {
  name: string;
  inputs: { name: string; type: string }[];
  outputs: { name: string; type: string }[];
  stateMutability: string;
  selector: string;
}

export interface EventFragment {
  name: string;
  inputs: { name: string; type: string; indexed: boolean }[];
  topic: string;
}

export interface ErrorFragment {
  name: string;
  inputs: { name: string; type: string }[];
  selector: string;
}

export class Interface {
  private _coder  = new GhostAbiCoder();
  private _abiCoder = new AbiCoder();
  private _abi: GhostABIFragment[];
  private _decoder: GhostEventDecoder;

  constructor(abi: GhostABIFragment[] | string) {
    this._abi = typeof abi === "string" ? JSON.parse(abi) : abi;
    this._decoder = new GhostEventDecoder(this._abi);
  }

  // ─── Fragment lookups ────────────────────────────────────────────────────

  getFunction(nameOrSelector: string): FunctionFragment {
    const frag = this._abi.find(
      (f) =>
        f.type === "function" &&
        (f.name === nameOrSelector ||
          this._coder.encodeFunctionSelector(f) === nameOrSelector.toLowerCase())
    );
    if (!frag) throw new GhostABIError(`function not found: ${nameOrSelector}`);
    return {
      name: frag.name!,
      inputs: (frag.inputs ?? []).map((i) => ({ name: i.name, type: i.type })),
      outputs: (frag.outputs ?? []).map((o) => ({ name: o.name, type: o.type })),
      stateMutability: frag.stateMutability ?? "nonpayable",
      selector: this._coder.encodeFunctionSelector(frag)
    };
  }

  getEvent(nameOrTopic: string): EventFragment {
    const frag = this._abi.find(
      (f) =>
        f.type === "event" &&
        (f.name === nameOrTopic ||
          this._coder.encodeEventTopic(f) === nameOrTopic.toLowerCase())
    );
    if (!frag) throw new GhostABIError(`event not found: ${nameOrTopic}`);
    return {
      name: frag.name!,
      inputs: (frag.inputs ?? []).map((i) => ({
        name: i.name,
        type: i.type,
        indexed: i.indexed ?? false
      })),
      topic: this._coder.encodeEventTopic(frag)
    };
  }

  getError(nameOrSelector: string): ErrorFragment {
    const frag = this._abi.find(
      (f) =>
        f.type === "error" &&
        (f.name === nameOrSelector ||
          this._coder.encodeFunctionSelector(f) === nameOrSelector.toLowerCase())
    );
    if (!frag) throw new GhostABIError(`error not found: ${nameOrSelector}`);
    return {
      name: frag.name!,
      inputs: (frag.inputs ?? []).map((i) => ({ name: i.name, type: i.type })),
      selector: this._coder.encodeFunctionSelector(frag)
    };
  }

  // ─── Encoding ────────────────────────────────────────────────────────────

  /** Returns the 4-byte selector hex (e.g. "0xabcd1234") for a function name. */
  getSighash(nameOrFragment: string | FunctionFragment): string {
    const frag =
      typeof nameOrFragment === "string"
        ? this._findFrag(nameOrFragment, "function")
        : this._abi.find((f) => f.name === nameOrFragment.name && f.type === "function");
    if (!frag) throw new GhostABIError(`function not found: ${nameOrFragment}`);
    return this._coder.encodeFunctionSelector(frag);
  }

  /** Encode a function call (selector + parameters). */
  encodeFunctionData(nameOrFragment: string, values: unknown[] = []): string {
    const frag = this._findFrag(
      typeof nameOrFragment === "string" ? nameOrFragment : (nameOrFragment as any).name,
      "function"
    );
    if (!frag) throw new GhostABIError(`function not found: ${nameOrFragment}`);
    return this._coder.encodeFunctionCall(frag, values);
  }

  /** Decode the result bytes from an eth_call into a Result-like array. */
  decodeFunctionResult(nameOrFragment: string, data: BytesLike): ReadonlyArray<unknown> {
    const hex = toHexString(data);
    const frag = this._findFrag(
      typeof nameOrFragment === "string" ? nameOrFragment : (nameOrFragment as any).name,
      "function"
    );
    if (!frag) throw new GhostABIError(`function not found: ${nameOrFragment}`);
    const result = this._coder.decodeFunctionResult(frag, hex);
    return Array.isArray(result) ? result : [result];
  }

  /** Encode constructor arguments. */
  encodeDeploy(values: unknown[] = []): string {
    const frag = this._abi.find((f) => f.type === "constructor");
    if (!frag) return "0x";
    const types = (frag.inputs ?? []).map((i) => i.type);
    return this._abiCoder.encode(types, values);
  }

  // ─── Event decoding ──────────────────────────────────────────────────────

  /** Decode a log using the ABI. */
  parseLog(log: GhostLog): {
    name: string;
    signature: string;
    args: Record<string, unknown>;
  } | null {
    try {
      return this._decoder.decode(log);
    } catch {
      return null;
    }
  }

  /** Decode transaction error data. */
  parseError(data: BytesLike): { name: string; args: unknown[] } | null {
    const hex = toHexString(data);
    const selector = hex.slice(0, 10);
    const frag = this._abi.find(
      (f) => f.type === "error" && this._coder.encodeFunctionSelector(f) === selector
    );
    if (!frag) return null;
    return {
      name: frag.name!,
      args: (frag.inputs ?? []).map((inp, i) =>
        this._abiCoder.decode([inp.type], "0x" + hex.slice(10 + i * 64, 10 + (i + 1) * 64))[0]
      )
    };
  }

  // ─── Format ──────────────────────────────────────────────────────────────

  format(): string[] {
    return this._abi.map((f) => {
      const ins = (f.inputs ?? []).map((i) => `${i.type} ${i.name}`).join(", ");
      return `${f.type} ${f.name ?? ""}(${ins})`;
    });
  }

  // ─── Helpers ─────────────────────────────────────────────────────────────

  private _findFrag(
    name: string,
    type: "function" | "event" | "error" | "constructor"
  ): GhostABIFragment | undefined {
    return this._abi.find((f) => f.type === type && f.name === name);
  }
}
