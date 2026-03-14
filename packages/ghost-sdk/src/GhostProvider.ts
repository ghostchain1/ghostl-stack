/**
 * @file GhostProvider.ts
 * @description GhostChain canonical JSON-RPC provider.
 * Wraps the ghost-sdk-core provider with GhostChain chain defaults.
 *
 * GhostChain RPC Endpoints:
 *   L1: https://rpc.ghostchain.io
 *   L2: https://l2.rpc.ghostchain.io
 *   L3: https://l3.rpc.ghostchain.io
 *
 * @example
 *   const provider = new GhostProvider("https://rpc.ghostchain.io");
 *   const balance = await provider.getGstBalance(address);
 */

import { GhostNativeProvider } from "./native/GhostNativeProvider.js";
import type { GhostAddress, Hex } from "./native/types.js";

export class GhostProvider {
  readonly rpcUrl: string;
  /** @internal — exposed for GhostWallet and GhostContract delegation */
  readonly _native: GhostNativeProvider;

  constructor(rpcUrl: string) {
    this.rpcUrl = rpcUrl;
    this._native = new GhostNativeProvider({ rpcUrl });
  }

  async getGstBalance(address: string): Promise<bigint> {
    return this._native.getBalance(address as GhostAddress);
  }

  async getBlockNumber(): Promise<number> {
    return Number(await this._native.getBlockNumber());
  }

  async call(tx: { to: string; data: string }): Promise<string> {
    return this._native.call({ to: tx.to as GhostAddress, data: tx.data as Hex });
  }
}
