import type { GhostAddress, Hex } from "./types.js";
import { GhostAbiError, GhostValidationError } from "../errors/GhostErrors.js";
import { keccak256Utf8 } from "./keccak.js";
import { add0x, strip0x, padHex, hexConcat } from "./hex.js";
import { utf8ToBytes, bytesToHex } from "./bytes.js";
import { assertAddress } from "./address.js";

type AbiType = "address" | "uint256" | "bool" | "bytes" | "string" | "bytes32";

export function functionSelector(signature: string): Hex {
  return add0x(strip0x(keccak256Utf8(signature)).slice(0, 8));
}

function pad32(hex: Hex): Hex { return padHex(hex, 32); }

function encodeUint256(v: bigint): Hex {
  if (v < 0n) throw new GhostValidationError("uint256 cannot be negative");
  return pad32(add0x(v.toString(16)));
}

function encodeAddress(v: GhostAddress): Hex {
  assertAddress(v);
  return pad32(add0x(strip0x(v)));
}

function encodeBytesFixed32(v: Hex): Hex {
  if (!/^0x[0-9a-fA-F]{64}$/.test(v)) throw new GhostAbiError("bytes32 must be 32 bytes hex");
  return v;
}

function encodeBytesDynamic(v: Hex): { tail: Hex } {
  if (!/^0x[0-9a-fA-F]*$/.test(v)) throw new GhostAbiError("bytes must be hex");
  const data = strip0x(v);
  const len = BigInt(data.length / 2);
  const lenEnc = encodeUint256(len);
  const paddedLen = Math.ceil(Number(len) / 32) * 32;
  const paddedData = data.padEnd(paddedLen * 2, "0");
  return { tail: hexConcat([lenEnc, add0x(paddedData)]) };
}

function encodeStringDynamic(v: string): { tail: Hex } {
  return encodeBytesDynamic(bytesToHex(utf8ToBytes(v)));
}

export function encodeCall(signature: string, types: AbiType[], values: unknown[]): Hex {
  if (types.length !== values.length) throw new GhostAbiError("ABI types/values length mismatch");
  const selector = functionSelector(signature);
  const headParts: Hex[] = [];
  const tailParts: Hex[] = [];
  const headSize = 32n * BigInt(types.length);
  let tailOffset = headSize;

  for (let i = 0; i < types.length; i++) {
    const t = types[i]!;
    const v = values[i];
    if (t === "uint256") { headParts.push(encodeUint256(BigInt(String(v)))); continue; }
    if (t === "bool")    { headParts.push(encodeUint256(v ? 1n : 0n)); continue; }
    if (t === "address") { headParts.push(encodeAddress(v as GhostAddress)); continue; }
    if (t === "bytes32") { headParts.push(encodeBytesFixed32(v as Hex)); continue; }
    if (t === "bytes")   {
      const enc = encodeBytesDynamic(v as Hex);
      headParts.push(encodeUint256(tailOffset));
      tailParts.push(enc.tail);
      tailOffset += BigInt(strip0x(enc.tail).length / 2);
      continue;
    }
    if (t === "string") {
      const enc = encodeStringDynamic(v as string);
      headParts.push(encodeUint256(tailOffset));
      tailParts.push(enc.tail);
      tailOffset += BigInt(strip0x(enc.tail).length / 2);
      continue;
    }
    throw new GhostAbiError(`Unsupported ABI type: ${t}`);
  }
  return hexConcat([selector, ...headParts, ...tailParts]);
}

export function decodeUint256(hex: Hex): bigint {
  const s = strip0x(hex);
  if (s.length < 64) throw new GhostAbiError("Invalid uint256 output");
  return BigInt(add0x(s.slice(0, 64)));
}

export function decodeAddress(hex: Hex): GhostAddress {
  const s = strip0x(hex);
  if (s.length < 64) throw new GhostAbiError("Invalid address output");
  return add0x(s.slice(24, 64)) as GhostAddress;
}
