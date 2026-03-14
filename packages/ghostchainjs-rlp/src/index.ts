/**
 * @file index.ts
 * @module @ghostchain/ghostchainjs-rlp
 *
 * GhostChain RLP (Recursive Length Prefix) encoding and decoding.
 * Drop-in replacement for @ethereumjs/rlp v4.x. // brand-enforcer-ignore
 * Zero external dependencies — pure TypeScript, Node.js built-ins only.
 *
 * Spec: https://ethereum.org/en/developers/docs/data-structures-and-encoding/rlp/
 */

// ─── Types ────────────────────────────────────────────────────────────────────

export type Input =
  | string
  | number
  | bigint
  | Uint8Array
  | Array<Input>
  | null
  | undefined;

export type NestedUint8Array = Array<Uint8Array | NestedUint8Array>;

export interface Decoded {
  data: Uint8Array | NestedUint8Array;
  remainder: Uint8Array;
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

/** Encode an unsigned integer as a big-endian Uint8Array with no leading zeros. */
function toBE(n: number | bigint): Uint8Array {
  if (n === 0 || n === 0n) return new Uint8Array(0);
  let hex = n.toString(16);
  if (hex.length % 2 !== 0) hex = "0" + hex;
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

/** Convert uint into big-endian byte array (at least 1 byte). */
function lengthBytes(len: number): Uint8Array {
  return toBE(len);
}

/** Concatenate multiple Uint8Arrays into a single Uint8Array. */
function concat(...parts: Uint8Array[]): Uint8Array {
  let total = 0;
  for (const p of parts) total += p.length;
  const out = new Uint8Array(total);
  let offset = 0;
  for (const p of parts) {
    out.set(p, offset);
    offset += p.length;
  }
  return out;
}

/** Coerce an Input value to Uint8Array bytes. */
function toBytes(input: Input): Uint8Array {
  if (input instanceof Uint8Array) return input;
  if (input === null || input === undefined) return new Uint8Array(0);
  if (typeof input === "number") {
    if (!Number.isInteger(input) || input < 0)
      throw new Error("RLP: number must be a non-negative integer");
    if (input === 0) return new Uint8Array(0);
    return toBE(input);
  }
  if (typeof input === "bigint") {
    if (input < 0n) throw new Error("RLP: bigint must be non-negative");
    if (input === 0n) return new Uint8Array(0);
    return toBE(input);
  }
  if (typeof input === "string") {
    // Hex string
    if (input.startsWith("0x") || input.startsWith("0X")) {
      const hex = input.slice(2);
      if (hex.length % 2 !== 0)
        throw new Error("RLP: odd-length hex string");
      const bytes = new Uint8Array(hex.length / 2);
      for (let i = 0; i < bytes.length; i++) {
        bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
      }
      return bytes;
    }
    // UTF-8 string
    return new TextEncoder().encode(input);
  }
  throw new Error(`RLP: unsupported input type ${typeof input}`);
}

// ─── Encode ──────────────────────────────────────────────────────────────────

/**
 * RLP-encode a value.
 *
 * Supports: `null | undefined` (empty string), `Uint8Array`, `string`,
 * `number`, `bigint`, and nested `Array<Input>`.
 *
 * @param input  Value to encode
 * @returns      RLP-encoded bytes
 */
export function encode(input: Input): Uint8Array {
  if (Array.isArray(input)) {
    // Encode each item, concatenate payload, then prefix list header.
    const parts: Uint8Array[] = input.map((item) => encode(item));
    const payload = concat(...parts);
    const len = payload.length;
    if (len <= 55) {
      // Short list: 0xC0 + length
      const header = new Uint8Array([0xc0 + len]);
      return concat(header, payload);
    } else {
      // Long list: 0xF7 + bytecount(length), then length, then payload
      const lenBytes = lengthBytes(len);
      const header = new Uint8Array([0xf7 + lenBytes.length]);
      return concat(header, lenBytes, payload);
    }
  }

  const bytes = toBytes(input);
  const len = bytes.length;

  if (len === 1 && bytes[0] < 0x80) {
    // Single byte in range [0x00, 0x7f] — encode as-is
    return bytes;
  }

  if (len <= 55) {
    // Short string: 0x80 + length, then bytes
    const header = new Uint8Array([0x80 + len]);
    return concat(header, bytes);
  } else {
    // Long string: 0xB7 + bytecount(length), then length, then bytes
    const lenBytes = lengthBytes(len);
    const header = new Uint8Array([0xb7 + lenBytes.length]);
    return concat(header, lenBytes, bytes);
  }
}

// ─── Decode ──────────────────────────────────────────────────────────────────

/** Decode a single RLP item from `buf` starting at `offset`, return item + new offset. */
function decodeItem(
  buf: Uint8Array,
  offset: number,
): { value: Uint8Array | NestedUint8Array; offset: number } {
  if (offset >= buf.length) throw new Error("RLP: input too short");
  const prefix = buf[offset];

  if (prefix < 0x80) {
    // Single byte
    return { value: buf.slice(offset, offset + 1), offset: offset + 1 };
  }

  if (prefix <= 0xb7) {
    // Short string
    const strLen = prefix - 0x80;
    if (offset + 1 + strLen > buf.length)
      throw new Error("RLP: string extends beyond input");
    if (strLen === 1 && buf[offset + 1] < 0x80)
      throw new Error("RLP: single byte must not be encoded as string");
    const slice = buf.slice(offset + 1, offset + 1 + strLen);
    return { value: slice, offset: offset + 1 + strLen };
  }

  if (prefix <= 0xbf) {
    // Long string
    const lenOfLen = prefix - 0xb7;
    if (offset + 1 + lenOfLen > buf.length)
      throw new Error("RLP: length prefix extends beyond input");
    let strLen = 0;
    for (let i = 0; i < lenOfLen; i++) {
      strLen = strLen * 256 + buf[offset + 1 + i];
    }
    if (strLen <= 55)
      throw new Error("RLP: string length must be > 55 for long encoding");
    const start = offset + 1 + lenOfLen;
    if (start + strLen > buf.length)
      throw new Error("RLP: string data extends beyond input");
    return { value: buf.slice(start, start + strLen), offset: start + strLen };
  }

  if (prefix <= 0xf7) {
    // Short list
    const listLen = prefix - 0xc0;
    const end = offset + 1 + listLen;
    if (end > buf.length)
      throw new Error("RLP: list extends beyond input");
    const items: (Uint8Array | NestedUint8Array)[] = [];
    let cur = offset + 1;
    while (cur < end) {
      const r = decodeItem(buf, cur);
      items.push(r.value);
      cur = r.offset;
    }
    return { value: items, offset: end };
  }

  // Long list
  const lenOfLen = prefix - 0xf7;
  if (offset + 1 + lenOfLen > buf.length)
    throw new Error("RLP: list length prefix extends beyond input");
  let listLen = 0;
  for (let i = 0; i < lenOfLen; i++) {
    listLen = listLen * 256 + buf[offset + 1 + i];
  }
  if (listLen <= 55)
    throw new Error("RLP: list length must be > 55 for long encoding");
  const start = offset + 1 + lenOfLen;
  const end = start + listLen;
  if (end > buf.length)
    throw new Error("RLP: list data extends beyond input");
  const items: (Uint8Array | NestedUint8Array)[] = [];
  let cur = start;
  while (cur < end) {
    const r = decodeItem(buf, cur);
    items.push(r.value);
    cur = r.offset;
  }
  return { value: items, offset: end };
}

/**
 * RLP-decode bytes.
 *
 * In normal mode, returns the decoded `Uint8Array | NestedUint8Array`.
 * In stream mode, returns `{ data, remainder }`.
 */
export function decode(input: Input, stream?: false): Uint8Array | NestedUint8Array;
export function decode(input: Input, stream?: true): Decoded;
export function decode(
  input: Input,
  stream = false,
): Uint8Array | NestedUint8Array | Decoded {
  const buf = toBytes(input);
  const { value, offset } = decodeItem(buf, 0);
  const remainder = buf.slice(offset);
  if (stream) {
    return { data: value, remainder };
  }
  if (remainder.length > 0)
    throw new Error("RLP: extra bytes after end of input");
  return value;
}

// ─── Utility helpers (mirrors @ethereumjs/rlp utils) ──────────────────────── // brand-enforcer-ignore─

function bytesToHex(uint8a: Uint8Array): string {
  return Array.from(uint8a)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function hexToBytes(hex: string): Uint8Array {
  const h = hex.startsWith("0x") ? hex.slice(2) : hex;
  if (h.length % 2 !== 0) throw new Error("odd-length hex string");
  const bytes = new Uint8Array(h.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(h.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

function concatBytes(...arrays: Uint8Array[]): Uint8Array {
  return concat(...arrays);
}

function utf8ToBytes(utf: string): Uint8Array {
  return new TextEncoder().encode(utf);
}

export const utils = {
  bytesToHex,
  concatBytes,
  hexToBytes,
  utf8ToBytes,
};

// ─── RLP class (static helpers, mirrors @ethereumjs/rlp.RLP) ────────────────  // brand-enforcer-ignore─

export const RLP = {
  encode,
  decode,
} as const;
