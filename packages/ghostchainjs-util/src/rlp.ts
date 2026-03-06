/**
 * @file rlp.ts
 * @module @ghostchain/ghostchain-util/rlp
 *
 * RLP (Recursive Length Prefix) encoder and decoder.
 * Per Ethereum Yellow Paper §B — used for Ghost transaction serialization.
 * Zero external dependencies.
 */

import { GhostRLPError } from "./errors.js";

// ─── Public types ─────────────────────────────────────────────────────────────

/** Valid input types for RLP encoding. */
export type RlpInput = bigint | number | Uint8Array | string | RlpInput[];

/** Decoded RLP value (symmetric with RlpInput). */
export type RlpDecoded = Uint8Array | RlpDecoded[];

// ─── Encoder ─────────────────────────────────────────────────────────────────

/**
 * RLP-encode a value.
 * Accepts: bigint, number, Uint8Array, 0x-prefixed hex string, or nested arrays.
 */
export function rlpEncode(input: RlpInput): Uint8Array {
  return _encode(input);
}

function _encode(input: RlpInput): Uint8Array {
  if (input === 0n || input === 0) return Uint8Array.from([0x80]);

  if (typeof input === "bigint" || typeof input === "number") {
    return _encode(_toBeBytes(BigInt(input)));
  }

  if (typeof input === "string") {
    const cleaned = input.startsWith("0x") ? input.slice(2) : input;
    if (cleaned === "") return Uint8Array.from([0x80]);
    const padded = cleaned.length % 2 === 0 ? cleaned : "0" + cleaned;
    return _encode(Uint8Array.from(Buffer.from(padded, "hex")));
  }

  if (input instanceof Uint8Array) {
    if (input.length === 0) return Uint8Array.from([0x80]);
    if (input.length === 1 && input[0] < 0x80) return input;
    return _concat([_encodeLength(input.length, 0x80), input]);
  }

  if (Array.isArray(input)) {
    const parts = input.map(_encode);
    const payload = _concat(parts);
    return _concat([_encodeLength(payload.length, 0xc0), payload]);
  }

  throw new GhostRLPError(`rlpEncode: unsupported input type: ${typeof input}`);
}

function _encodeLength(length: number, offset: number): Uint8Array {
  if (length < 56) return Uint8Array.from([offset + length]);
  const lenBytes = _toBeBytes(BigInt(length));
  if (lenBytes.length > 8)
    throw new GhostRLPError("rlpEncode: item too large to encode");
  return Uint8Array.from([offset + 55 + lenBytes.length, ...lenBytes]);
}

function _toBeBytes(n: bigint): Uint8Array {
  if (n === 0n) return new Uint8Array(0);
  const hex = n.toString(16);
  const padded = hex.length % 2 === 0 ? hex : "0" + hex;
  return Uint8Array.from(Buffer.from(padded, "hex"));
}

// ─── Decoder ─────────────────────────────────────────────────────────────────

/**
 * RLP-decode a byte array.
 * Returns the decoded value and the number of bytes consumed.
 */
export function rlpDecode(data: Uint8Array, offset = 0): { value: RlpDecoded; consumed: number } {
  return _decode(data, offset);
}

/**
 * Convenience: decode the full buffer and return just the decoded value.
 */
export function rlpDecodeValue(data: Uint8Array): RlpDecoded {
  return _decode(data, 0).value;
}

function _decode(data: Uint8Array, offset: number): { value: RlpDecoded; consumed: number } {
  if (offset >= data.length)
    throw new GhostRLPError(`rlpDecode: offset ${offset} out of bounds (length ${data.length})`);

  const prefix = data[offset];

  // Single byte in [0x00, 0x7f]
  if (prefix <= 0x7f) {
    return { value: data.slice(offset, offset + 1), consumed: 1 };
  }

  // Short string [0x80, 0xb7]: length = prefix - 0x80
  if (prefix <= 0xb7) {
    const len = prefix - 0x80;
    if (len === 0) return { value: new Uint8Array(0), consumed: 1 };
    _assertBounds(data, offset + 1, len);
    return { value: data.slice(offset + 1, offset + 1 + len), consumed: 1 + len };
  }

  // Long string [0xb8, 0xbf]: length-of-length = prefix - 0xb7
  if (prefix <= 0xbf) {
    const lenOfLen = prefix - 0xb7;
    _assertBounds(data, offset + 1, lenOfLen);
    const len = Number(_fromBeBytes(data.slice(offset + 1, offset + 1 + lenOfLen)));
    _assertBounds(data, offset + 1 + lenOfLen, len);
    return {
      value: data.slice(offset + 1 + lenOfLen, offset + 1 + lenOfLen + len),
      consumed: 1 + lenOfLen + len,
    };
  }

  // Short list [0xc0, 0xf7]: payload length = prefix - 0xc0
  if (prefix <= 0xf7) {
    const payloadLen = prefix - 0xc0;
    _assertBounds(data, offset + 1, payloadLen);
    const items = _decodeList(data, offset + 1, payloadLen);
    return { value: items, consumed: 1 + payloadLen };
  }

  // Long list [0xf8, 0xff]: length-of-length = prefix - 0xf7
  const lenOfLen = prefix - 0xf7;
  _assertBounds(data, offset + 1, lenOfLen);
  const payloadLen = Number(_fromBeBytes(data.slice(offset + 1, offset + 1 + lenOfLen)));
  _assertBounds(data, offset + 1 + lenOfLen, payloadLen);
  const items = _decodeList(data, offset + 1 + lenOfLen, payloadLen);
  return { value: items, consumed: 1 + lenOfLen + payloadLen };
}

function _decodeList(data: Uint8Array, start: number, payloadLen: number): RlpDecoded[] {
  const items: RlpDecoded[] = [];
  let pos = start;
  const end = start + payloadLen;
  while (pos < end) {
    const { value, consumed } = _decode(data, pos);
    items.push(value);
    pos += consumed;
  }
  return items;
}

function _assertBounds(data: Uint8Array, start: number, len: number): void {
  if (start + len > data.length)
    throw new GhostRLPError(`rlpDecode: data truncated at offset ${start} (need ${len} bytes)`);
}

function _fromBeBytes(bytes: Uint8Array): bigint {
  let result = 0n;
  for (const b of bytes) result = (result << 8n) | BigInt(b);
  return result;
}

// ─── Internal concat util ─────────────────────────────────────────────────────

function _concat(arrays: Uint8Array[]): Uint8Array {
  const total = arrays.reduce((s, a) => s + a.length, 0);
  const out = new Uint8Array(total);
  let pos = 0;
  for (const a of arrays) { out.set(a, pos); pos += a.length; }
  return out;
}
