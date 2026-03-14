import type { Hex } from "./types.js";
import { bytesToHex, hexToBytes, concatBytes } from "./bytes.js";
import { add0x } from "./hex.js";

type RlpItem = Uint8Array | RlpItem[];

function encodeLength(len: number, offset: number): Uint8Array {
  if (len < 56) return Uint8Array.from([len + offset]);
  const hexLen = len.toString(16);
  const l = Math.ceil(hexLen.length / 2);
  const lenBytes = hexToBytes(add0x(hexLen.padStart(l * 2, "0")));
  return concatBytes(Uint8Array.from([offset + 55 + l]), lenBytes);
}

function encodeItem(item: RlpItem): Uint8Array {
  if (item instanceof Uint8Array) {
    if (item.length === 1 && item[0]! < 0x80) return item;
    return concatBytes(encodeLength(item.length, 0x80), item);
  }
  const encoded = item.map(encodeItem);
  const totalLen = encoded.reduce((a, b) => a + b.length, 0);
  const payload = new Uint8Array(totalLen);
  let off = 0;
  for (const c of encoded) { payload.set(c, off); off += c.length; }
  return concatBytes(encodeLength(payload.length, 0xc0), payload);
}

export function rlpEncode(items: RlpItem): Uint8Array {
  return encodeItem(items);
}

export function rlpEncodeHex(items: RlpItem): Hex {
  return bytesToHex(rlpEncode(items));
}
