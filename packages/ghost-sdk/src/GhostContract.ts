/**
 * @file GhostContract.ts
 * @description GhostChain smart contract interaction wrapper.
 * Replaces ethers.Contract in GhostStack consumer code.
 *
 * @example
 *   const token = new GhostContract(GST_ADDRESS, ERC20_ABI, wallet);
 *   const balance = await token.call("balanceOf", [address]);
 */

import type { GhostProvider } from "./GhostProvider.js";
import type { GhostWallet } from "./GhostWallet.js";

type AbiFragment = Record<string, unknown>;

export class GhostContract {
  readonly address: string;
  readonly abi: readonly AbiFragment[];
  readonly signerOrProvider: GhostWallet | GhostProvider;

  constructor(
    address: string,
    abi: readonly AbiFragment[],
    signerOrProvider: GhostWallet | GhostProvider
  ) {
    this.address = address;
    this.abi = abi;
    this.signerOrProvider = signerOrProvider;
  }

  async call(method: string, args: unknown[] = []): Promise<unknown> {
    // TODO: encode calldata and call via GhostProvider
    throw new Error(`GhostContract.call(${method}): not yet implemented`);
  }

  async send(method: string, args: unknown[] = []): Promise<string> {
    // TODO: encode calldata and send via GhostWallet
    throw new Error(`GhostContract.send(${method}): not yet implemented`);
  }
}
