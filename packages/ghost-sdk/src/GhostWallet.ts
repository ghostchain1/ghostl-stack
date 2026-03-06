/**
 * @file GhostWallet.ts
 * @description GhostChain canonical wallet and transaction signer.
 * Replaces ethers.Wallet in GhostStack consumer code.
 *
 * @example
 *   const wallet = GhostWallet.fromPrivateKey(privateKey, provider);
 *   const tx = await wallet.sendGst(recipient, amount);
 */

import type { GhostProvider } from "./GhostProvider.js";
import { GhostNativeWallet } from "./native/GhostNativeWallet.js";
import type { GhostAddress, Hex } from "./native/types.js";

export class GhostWallet {
  readonly address: string;
  readonly provider: GhostProvider | undefined;
  /** @internal */
  private readonly _native: GhostNativeWallet;

  private constructor(nativeWallet: GhostNativeWallet, provider?: GhostProvider) {
    this.address = nativeWallet.address;
    this.provider = provider;
    this._native = nativeWallet;
  }

  static fromPrivateKey(privateKey: string, provider?: GhostProvider): GhostWallet {
    const native = GhostNativeWallet.fromPrivateKey(privateKey as Hex);
    return new GhostWallet(native, provider);
  }

  static fromMnemonic(_mnemonic: string, _provider?: GhostProvider): GhostWallet {
    throw new Error("GhostWallet.fromMnemonic: not yet implemented");
  }

  connect(provider: GhostProvider): GhostWallet {
    return new GhostWallet(this._native, provider);
  }

  async sendGst(to: string, amount: bigint): Promise<string> {
    if (!this.provider) throw new Error("GhostWallet.sendGst: no provider connected — call wallet.connect(provider) first");
    return this._native.sendTransaction(this.provider._native, { to: to as GhostAddress, value: amount });
  }

  /** Send a transaction with arbitrary calldata (for contract interactions). */
  async sendTransaction(to: string, data: string, value = 0n): Promise<string> {
    if (!this.provider) throw new Error("GhostWallet.sendTransaction: no provider connected — call wallet.connect(provider) first");
    return this._native.sendTransaction(this.provider._native, { to: to as GhostAddress, data: data as Hex, value });
  }

  async signMessage(message: string): Promise<string> {
    return this._native.signMessage(new TextEncoder().encode(message));
  }
}
