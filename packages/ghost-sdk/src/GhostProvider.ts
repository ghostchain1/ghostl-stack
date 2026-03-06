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

export class GhostProvider {
  readonly rpcUrl: string;

  constructor(rpcUrl: string) {
    this.rpcUrl = rpcUrl;
  }

  async getGstBalance(address: string): Promise<bigint> {
    // TODO: implement via ghost_getBalance RPC call
    throw new Error("GhostProvider.getGstBalance: not yet implemented");
  }

  async getBlockNumber(): Promise<number> {
    // TODO: implement via ghost_blockNumber
    throw new Error("GhostProvider.getBlockNumber: not yet implemented");
  }

  async call(tx: { to: string; data: string }): Promise<string> {
    // TODO: implement via ghost_call
    throw new Error("GhostProvider.call: not yet implemented");
  }
}
