// ─────────────────────────────────────────────────────────────────────────────
// Real RLP (Recursive Length Prefix) encoder – GhostChain Yellow Paper §B
// Handles: bigint, number, Uint8Array, hex string, and nested arrays.
// ─────────────────────────────────────────────────────────────────────────────

export type RlpInput = bigint | number | Uint8Array | string | RlpInput[];

// ─── Public API ──────────────────────────────────────────────────────────────

export function rlpEncode(input: RlpInput): Uint8Array {
  return _encode(input);
}

export function rlpDecode(data: Uint8Array, offset = 0): { value: RlpInput; consumed: number } {
  return _decode(data, offset);
}

// ─── Encoder ─────────────────────────────────────────────────────────────────

function _encode(input: RlpInput): Uint8Array {
  // null / zero / empty
  if (input === 0n || input === 0) return Uint8Array.from([0x80]);

  // bigint / number  →  big-endian bytes (strip leading zeros)
  if (typeof input === "bigint" || typeof input === "number") {
    return _encode(_toBeBytes(BigInt(input)));
  }

  // hex string  →  bytes
  if (typeof input === "string") {
    const cleaned = input.startsWith("0x") ? input.slice(2) : input;
    // Special-case empty string / zero-value address check ("" → empty bytes)
    if (cleaned === "") return Uint8Array.from([0x80]);
    return _encode(Uint8Array.from(Buffer.from(cleaned.padStart(cleaned.length % 2 === 0 ? cleaned.length : cleaned.length + 1, "0"), "hex")));
  }

  // Uint8Array  →  byte array item
  if (input instanceof Uint8Array) {
    if (input.length === 0) return Uint8Array.from([0x80]);
    if (input.length === 1 && input[0] < 0x80) return input;
    return _concat([_encodeLen(input.length, 0x80), input]);
  }

  // Array  →  list
  if (Array.isArray(input)) {
    const parts = input.map(_encode);
    const payload = _concat(parts);
    return _concat([_encodeLen(payload.length, 0xc0), payload]);
  }

  throw new Error(`RLP: unsupported input type: ${typeof input}`);
}

function _encodeLen(length: number, offset: number): Uint8Array {
  if (length < 56) {
    return Uint8Array.from([offset + length]);
  }
  const lenBytes = _toBeBytes(BigInt(length));
  return Uint8Array.from([offset + 55 + lenBytes.length, ...lenBytes]);
}

function _toBeBytes(n: bigint): Uint8Array {
  if (n === 0n) return new Uint8Array(0);
  const hex = n.toString(16);
  const padded = hex.length % 2 === 0 ? hex : "0" + hex;
  return Uint8Array.from(Buffer.from(padded, "hex"));
}

function _concat(arrays: Uint8Array[]): Uint8Array {
  const total = arrays.reduce((s, a) => s + a.length, 0);
  const out = new Uint8Array(total);
  let pos = 0;
  for (const a of arrays) {
    out.set(a, pos);
    pos += a.length;
  }
  return out;
}

// ─── Decoder ─────────────────────────────────────────────────────────────────

function _decode(data: Uint8Array, offset: number): { value: RlpInput; consumed: number } {
  const prefix = data[offset];

  if (prefix === undefined) throw new Error("RLP: unexpected end of data");

  // single byte
  if (prefix < 0x80) {
    return { value: Uint8Array.from([prefix]), consumed: 1 };
  }

  // short string (0–55 bytes)
  if (prefix <= 0xb7) {
    const len = prefix - 0x80;
    return { value: data.slice(offset + 1, offset + 1 + len), consumed: 1 + len };
  }

  // long string
  if (prefix <= 0xbf) {
    const lenLen = prefix - 0xb7;
    const len = Number("0x" + Buffer.from(data.slice(offset + 1, offset + 1 + lenLen)).toString("hex"));
    return { value: data.slice(offset + 1 + lenLen, offset + 1 + lenLen + len), consumed: 1 + lenLen + len };
  }

  // short list (0–55 bytes payload)
  if (prefix <= 0xf7) {
    const listLen = prefix - 0xc0;
    return _decodeList(data, offset + 1, listLen);
  }

  // long list
  const listLenLen = prefix - 0xf7;
  const listLen = Number("0x" + Buffer.from(data.slice(offset + 1, offset + 1 + listLenLen)).toString("hex"));
  return _decodeList(data, offset + 1 + listLenLen, listLen);
}

function _decodeList(
  data: Uint8Array,
  start: number,
  payloadLen: number
): { value: RlpInput; consumed: number } {
  const items: RlpInput[] = [];
  let pos = start;
  const end = start + payloadLen;
  while (pos < end) {
    const { value, consumed } = _decode(data, pos);
    items.push(value);
    pos += consumed;
  }
  const headerLen = start - (start - payloadLen - /* prefix */ 1);
  return { value: items, consumed: payloadLen + (start - (end - payloadLen)) };
}
