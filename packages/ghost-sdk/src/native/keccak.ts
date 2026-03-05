import { keccak_256 } from "@noble/hashes/sha3";
import type { Hex } from "./types.js";
import { bytesToHex, hexToBytes, utf8ToBytes } from "./bytes.js";

export function keccak256Bytes(data: Uint8Array): Uint8Array {
  return keccak_256(data);
}

export function keccak256Hex(hex: Hex): Hex {
  return bytesToHex(keccak256Bytes(hexToBytes(hex)));
}

export function keccak256Utf8(text: string): Hex {
  return bytesToHex(keccak256Bytes(utf8ToBytes(text)));
}
