import { GhostValidationError } from "../errors/GhostErrors.js";
import type { Hex } from "./types.js";
import { strip0x, add0x, assertHex } from "./hex.js";

export function hexToBytes(hex: Hex): Uint8Array {
  assertHex(hex);
  const s = strip0x(hex);
  if (s.length % 2 !== 0) throw new GhostValidationError("Hex length must be even");
  const out = new Uint8Array(s.length / 2);
  for (let i = 0; i < out.length; i++) {
    out[i] = parseInt(s.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

export function bytesToHex(bytes: Uint8Array): Hex {
  let s = "";
  for (const b of bytes) s += b.toString(16).padStart(2, "0");
  return add0x(s);
}

export function concatBytes(a: Uint8Array, b: Uint8Array): Uint8Array {
  const out = new Uint8Array(a.length + b.length);
  out.set(a, 0);
  out.set(b, a.length);
  return out;
}

export function utf8ToBytes(text: string): Uint8Array {
  return new TextEncoder().encode(text);
}

export function bytesToUtf8(bytes: Uint8Array): string {
  return new TextDecoder().decode(bytes);
}
