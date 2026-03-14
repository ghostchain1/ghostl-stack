import type { GhostTxReceipt } from "./types.js";
import { hexToBigInt } from "./hex.js";

export function receiptStatusOk(r: GhostTxReceipt): boolean {
  if (!r.status) return true; // pre-byzantium: no status = success
  return hexToBigInt(r.status) === 1n;
}

export function receiptGasUsed(r: GhostTxReceipt): bigint {
  return hexToBigInt(r.gasUsed);
}

export function receiptBlockNumber(r: GhostTxReceipt): bigint {
  return hexToBigInt(r.blockNumber);
}
