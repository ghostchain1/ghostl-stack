/**
 * GhostWallet
 *
 * Extends ghost v6 Wallet with GhostStack layer awareness.
 * Works with ghostJsonRpcProvider out of the box.
 */

import { Wallet, type Provider } from "ethers";
import { ghostJsonRpcProvider } from "./provider.js";
import { GhostNetworks, type GhostLayer } from "./networks.js";

export class GhostWallet extends Wallet {
  /** The GhostStack layer this wallet targets. */
  readonly layer: GhostLayer;

  constructor(
    privateKey: string | { privateKey: string },
    providerOrLayer?: ghostJsonRpcProvider | GhostLayer,
    layer?: GhostLayer
  ) {
    let resolvedLayer: GhostLayer;
    let resolvedProvider: Provider | undefined;

    if (providerOrLayer instanceof ghostJsonRpcProvider) {
      resolvedProvider = providerOrLayer;
      resolvedLayer = providerOrLayer.layer;
    } else if (typeof providerOrLayer === "string") {
      resolvedLayer = providerOrLayer;
      resolvedProvider = new ghostJsonRpcProvider(undefined, resolvedLayer);
    } else {
      resolvedLayer = layer ?? "L1";
      resolvedProvider = new ghostJsonRpcProvider(undefined, resolvedLayer);
    }

    const pk =
      typeof privateKey === "string" ? privateKey : privateKey.privateKey;

    super(pk, resolvedProvider);
    this.layer = resolvedLayer;
  }

  /** Switch this wallet to a different GhostStack layer, returning a new instance. */
  connectToLayer(layer: GhostLayer, url?: string): GhostWallet {
    const provider = new ghostJsonRpcProvider(url, layer);
    return new GhostWallet(this.privateKey, provider);
  }

  /** Convenience: get GST balance in wei for this wallet's address. */
  async getGSTBalance(): Promise<bigint> {
    if (!this.provider) throw new Error("No provider attached to GhostWallet");
    return this.provider.getBalance(this.address);
  }

  /** Returns `{ address, layer, chainId }` identification for this wallet. */
  async identify(): Promise<{ address: string; layer: GhostLayer; chainId: number }> {
    const chainId = Number((await this.provider?.getNetwork())?.chainId ?? GhostNetworks[this.layer].chainId);
    return { address: this.address, layer: this.layer, chainId };
  }
}

// ─── factory helpers ─────────────────────────────────────────────────────────

/**
 * Create a GhostWallet from a mnemonic phrase.
 *
 * ```ts
 * const wallet = ghostWalletFromMnemonic("word1 word2 ...", "L2");
 * ```
 */
export function ghostWalletFromMnemonic(
  mnemonic: string,
  layer: GhostLayer = "L1",
  path = "m/44'/60'/0'/0/0",
  url?: string
): GhostWallet {
  const inner = Wallet.fromPhrase(mnemonic);
  const provider = new ghostJsonRpcProvider(url, layer);
  return new GhostWallet(inner.privateKey, provider);
}

/**
 * Create a random GhostWallet on the given layer.
 *
 * ```ts
 * const wallet = createRandomGhostWallet("L3");
 * ```
 */
export function createRandomGhostWallet(layer: GhostLayer = "L1", url?: string): GhostWallet {
  const inner = Wallet.createRandom();
  const provider = new ghostJsonRpcProvider(url, layer);
  return new GhostWallet(inner.privateKey, provider);
}
