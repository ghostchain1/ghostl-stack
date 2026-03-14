import type { GhostAddress, Hex } from "./types.js";
import { encodeCall, decodeUint256, decodeAddress } from "./abi.js";

/** Minimal ABI encoder/decoder — pure TypeScript, no ethers. */
export class GhostNativeInterface {
  encodeFunctionData(signature: string, types: string[], values: unknown[]): Hex {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return encodeCall(signature, types as any, values);
  }
  decodeUint256Result(hex: Hex): bigint { return decodeUint256(hex); }
  decodeAddressResult(hex: Hex): GhostAddress { return decodeAddress(hex); }
}
