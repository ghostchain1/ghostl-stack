/**
 * @file abi.ts
 * @module @ghostchain/ghostchain-util/abi
 *
 * Minimal ABI encoder/decoder for GhostChain — no ethers dependency.
 *
 * Supports encoding/decoding the most common Solidity types:
 *   - uint256, int256, uint<N>, int<N>
 *   - bool
 *   - address
 *   - bytes, bytes<N>
 *   - string
 *   - (T)[] dynamic arrays
 *   - tuples: (T1, T2, ...)
 *
 * For full ABI support (events, errors, complex nested tuples) use
 * the ghost-sdk-core AbiCoder which wraps a complete implementation.
 */

import { hexToBytes, bytesToHex, padLeft, padRight, fromHex } from "./hex.js";
import { functionSelector } from "./hash.js";
import { GhostABIError } from "./errors.js";
import type { GhostABIFragment, GhostABIInput } from "./types.js";

// ─── Word utilities ───────────────────────────────────────────────────────────

const WORD = 32; // ABI word size in bytes

function _padLeft(bytes: Uint8Array): Uint8Array {
  const out = new Uint8Array(WORD);
  out.set(bytes, WORD - bytes.length);
  return out;
}

function _padRight(bytes: Uint8Array): Uint8Array {
  const out = new Uint8Array(WORD);
  out.set(bytes, 0);
  return out;
}

function _numToWord(n: bigint): Uint8Array {
  // Handle two's complement negative numbers
  const positive = n < 0n ? (1n << 256n) + n : n;
  const hex = positive.toString(16).padStart(64, "0");
  return hexToBytes("0x" + hex);
}

function _wordToNum(word: Uint8Array, signed: boolean): bigint {
  let n = BigInt("0x" + Array.from(word).map((b) => b.toString(16).padStart(2, "0")).join(""));
  if (signed && word[0] >= 0x80) {
    n = n - (1n << 256n);
  }
  return n;
}

function _concat(...arrays: Uint8Array[]): Uint8Array {
  const total = arrays.reduce((s, a) => s + a.length, 0);
  const out = new Uint8Array(total);
  let pos = 0;
  for (const a of arrays) { out.set(a, pos); pos += a.length; }
  return out;
}

// ─── Type classification ──────────────────────────────────────────────────────

function _isDynamic(type: string): boolean {
  return type === "bytes" || type === "string" || type.endsWith("[]");
}

// ─── Single-value encoder ─────────────────────────────────────────────────────

function _encodeValue(type: string, value: unknown): { head: Uint8Array; tail: Uint8Array } {
  // uint<N> / int<N>
  if (type.startsWith("uint") || type.startsWith("int")) {
    const signed = type.startsWith("int");
    const n = typeof value === "bigint" ? value : BigInt(String(value));
    return { head: _numToWord(n), tail: new Uint8Array(0) };
  }

  // bool
  if (type === "bool") {
    return { head: _numToWord(value ? 1n : 0n), tail: new Uint8Array(0) };
  }

  // address
  if (type === "address") {
    const addr = String(value).toLowerCase().replace("0x", "");
    if (addr.length !== 40) throw new GhostABIError(`abi encode: invalid address "${value}"`);
    const bytes = hexToBytes("0x" + addr);
    return { head: _padLeft(bytes), tail: new Uint8Array(0) };
  }

  // bytes<N> (fixed-size)
  if (/^bytes\d+$/.test(type)) {
    const bytes = typeof value === "string" ? hexToBytes(value) : (value as Uint8Array);
    return { head: _padRight(bytes), tail: new Uint8Array(0) };
  }

  // bytes (dynamic)
  if (type === "bytes") {
    const bytes = typeof value === "string" ? hexToBytes(value) : (value as Uint8Array);
    const lenWord = _numToWord(BigInt(bytes.length));
    const padded = new Uint8Array(Math.ceil(bytes.length / WORD) * WORD);
    padded.set(bytes);
    return { head: new Uint8Array(0), tail: _concat(lenWord, padded) };
  }

  // string  →  UTF-8 → bytes (dynamic)
  if (type === "string") {
    const bytes = new TextEncoder().encode(String(value));
    const lenWord = _numToWord(BigInt(bytes.length));
    const padded = new Uint8Array(Math.ceil(bytes.length / WORD) * WORD);
    padded.set(bytes);
    return { head: new Uint8Array(0), tail: _concat(lenWord, padded) };
  }

  throw new GhostABIError(`abi encode: unsupported type "${type}"`);
}

// ─── Public API: encode ───────────────────────────────────────────────────────

/**
 * ABI-encode a list of (type, value) pairs.
 * Returns a 0x-prefixed hex string.
 *
 * @example
 *   abiEncode(["address","uint256"], ["0xdead...", 1000n])
 */
export function abiEncode(types: string[], values: unknown[]): string {
  if (types.length !== values.length)
    throw new GhostABIError(`abiEncode: types.length (${types.length}) !== values.length (${values.length})`);

  const heads: Uint8Array[] = [];
  const tails: Uint8Array[] = [];
  let tailOffset = types.length * WORD;

  for (let i = 0; i < types.length; i++) {
    const type = types[i];
    const isDyn = _isDynamic(type);

    if (isDyn) {
      const { tail } = _encodeValue(type, values[i]);
      heads.push(_numToWord(BigInt(tailOffset)));
      tails.push(tail);
      tailOffset += tail.length;
    } else {
      const { head } = _encodeValue(type, values[i]);
      heads.push(head);
    }
  }

  return bytesToHex(_concat(...heads, ...tails));
}

/**
 * ABI-encode a function call: 4-byte selector + encoded arguments.
 *
 * @example
 *   abiEncodeCall("transfer(address,uint256)", ["0xdead...", 100n])
 */
export function abiEncodeCall(signature: string, args: unknown[]): string {
  const sel = functionSelector(signature);
  // extract param types from signature
  const inner = signature.slice(signature.indexOf("(") + 1, signature.lastIndexOf(")"));
  const types = inner ? inner.split(",").map((t) => t.trim()) : [];
  const encoded = abiEncode(types, args);
  return sel + encoded.slice(2); // join selector + payload
}

// ─── Public API: decode ───────────────────────────────────────────────────────

/**
 * ABI-decode a hex-encoded payload given type strings.
 * Returns an array of typed values.
 *
 * @example
 *   abiDecode(["address","uint256"], "0x000...dead0000...64")
 *   → ["0xdEaD...", 100n]
 */
export function abiDecode(types: string[], data: string): unknown[] {
  const bytes = hexToBytes(data);
  const results: unknown[] = [];

  let headPos = 0;
  for (let i = 0; i < types.length; i++) {
    const type = types[i];
    if (_isDynamic(type)) {
      // head contains offset into buffer
      const offsetBig = _wordToNum(bytes.slice(headPos, headPos + WORD), false);
      const offset = Number(offsetBig);
      results.push(_decodeDynamic(type, bytes, offset));
    } else {
      results.push(_decodeStatic(type, bytes.slice(headPos, headPos + WORD)));
    }
    headPos += WORD;
  }

  return results;
}

function _decodeStatic(type: string, word: Uint8Array): unknown {
  if (type.startsWith("uint")) return _wordToNum(word, false);
  if (type.startsWith("int"))  return _wordToNum(word, true);
  if (type === "bool")         return _wordToNum(word, false) !== 0n;
  if (type === "address")      return bytesToHex(word.slice(12)); // last 20 bytes
  if (/^bytes\d+$/.test(type)) {
    const n = parseInt(type.slice(5));
    return bytesToHex(word.slice(0, n));
  }
  throw new GhostABIError(`abiDecode: unsupported static type "${type}"`);
}

function _decodeDynamic(type: string, data: Uint8Array, offset: number): unknown {
  if (type === "bytes" || type === "string") {
    const len = Number(_wordToNum(data.slice(offset, offset + WORD), false));
    const raw = data.slice(offset + WORD, offset + WORD + len);
    return type === "string" ? new TextDecoder().decode(raw) : bytesToHex(raw);
  }
  throw new GhostABIError(`abiDecode: unsupported dynamic type "${type}"`);
}

// ─── ABI Fragment helpers ─────────────────────────────────────────────────────

/**
 * Build the canonical signature string from a GhostABIFragment.
 * @example ghostABISignature(transferFragment) → "transfer(address,uint256)"
 */
export function ghostABISignature(fragment: GhostABIFragment): string {
  if (!fragment.name) throw new GhostABIError("ghostABISignature: fragment has no name");
  const params = (fragment.inputs ?? []).map(_inputType).join(",");
  return `${fragment.name}(${params})`;
}

function _inputType(input: GhostABIInput): string {
  if (input.type === "tuple" && input.components) {
    return "(" + input.components.map(_inputType).join(",") + ")";
  }
  return input.type;
}

/**
 * Compute the 4-byte function selector from a GhostABIFragment.
 */
export function ghostFunctionSelector(fragment: GhostABIFragment): string {
  return functionSelector(ghostABISignature(fragment));
}
