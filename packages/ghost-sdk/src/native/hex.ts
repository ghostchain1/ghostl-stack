import { GhostValidationError } from "../errors/GhostErrors.js";
import type { Hex } from "./types.js";

export function isHex(value: string): value is Hex {
  return /^0x[0-9a-fA-F]*$/.test(value);
}

export function assertHex(value: string, label = "hex"): asserts value is Hex {
  if (!isHex(value)) throw new GhostValidationError(`Invalid ${label}: ${value}`);
}

export function strip0x(hex: Hex | string): string {
  return hex.startsWith("0x") ? hex.slice(2) : hex;
}

export function add0x(s: string): Hex {
  return (s.startsWith("0x") ? s : `0x${s}`) as Hex;
}

export function padHex(hex: Hex, bytes: number): Hex {
  const s = strip0x(hex);
  return add0x(s.padStart(bytes * 2, "0"));
}

export function hexToBigInt(hex: Hex): bigint {
  return BigInt(hex);
}

export function bigIntToHex(n: bigint): Hex {
  if (n < 0n) throw new GhostValidationError("Negative bigint not supported");
  return add0x(n.toString(16));
}

export function hexConcat(parts: Hex[]): Hex {
  return add0x(parts.map(strip0x).join(""));
}
