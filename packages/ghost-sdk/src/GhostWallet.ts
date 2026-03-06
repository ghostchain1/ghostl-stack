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

export class GhostWallet {
  readonly address: string;
  readonly provider: GhostProvider | undefined;

  private constructor(address: string, provider?: GhostProvider) {
    this.address = address;
    this.provider = provider;
  }

  static fromPrivateKey(privateKey: string, provider?: GhostProvider): GhostWallet {
    // TODO: derive address from private key via ghost-sdk-core/accounts
    throw new Error("GhostWallet.fromPrivateKey: not yet implemented");
  }

  static fromMnemonic(mnemonic: string, provider?: GhostProvider): GhostWallet {
    throw new Error("GhostWallet.fromMnemonic: not yet implemented");
  }

  connect(provider: GhostProvider): GhostWallet {
    return new GhostWallet(this.address, provider);
  }

  async sendGst(to: string, amount: bigint): Promise<string> {
    // TODO: sign and broadcast via ghost_sendRawTransaction
    throw new Error("GhostWallet.sendGst: not yet implemented");
  }

  async signMessage(message: string): Promise<string> {
    throw new Error("GhostWallet.signMessage: not yet implemented");
  }
}
