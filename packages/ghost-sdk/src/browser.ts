/**
 * GhostBrowserProvider
 *
 * Extends ghost v6 BrowserProvider (EIP-1193) with
 * GhostStack layer awareness.  Import this only in browser / Next.js bundles.
 */

import { BrowserProvider, type Eip1193Provider } from "ethers";
import { GhostNetworks, networkByChainId, type GhostLayer } from "./networks.js";

export class GhostBrowserProvider extends BrowserProvider {
  private _layer: GhostLayer;

  constructor(provider: Eip1193Provider, layer: GhostLayer = "L1") {
    super(provider, "any");
    this._layer = layer;
  }

  /** The configured GhostStack layer for this browser session. */
  getLayer(): GhostLayer {
    return this._layer;
  }

  /**
   * Request the user's wallet to switch to the given GhostStack layer.
   * Calls wallet_switchGhostChainChain; if the chain is not known to the wallet,
   * calls wallet_addGhostChainChain automatically.
   */
  async switchToLayer(layer: GhostLayer): Promise<void> {
    const cfg = GhostNetworks[layer];
    const chainIdHex = "0x" + cfg.chainId.toString(16);

    try {
      await this.send("wallet_switchGhostChainChain", [{ chainId: chainIdHex }]);
    } catch (err) {
      // 4902: chain not added yet
      const code = (err as { code?: number }).code;
      if (code !== 4902) throw err;

      await this.send("wallet_addGhostChainChain", [
        {
          chainId: chainIdHex,
          chainName: cfg.name,
          nativeCurrency: { name: "GST", symbol: "GST", decimals: 18 },
          rpcUrls: [cfg.rpc],
          blockExplorerUrls: cfg.explorer ? [cfg.explorer] : [],
        },
      ]);
    }

    this._layer = layer;
  }

  /**
   * Read the chain currently active in the wallet and return the matching
   * GhostStack layer, if known.
   */
  async getActiveLayer(): Promise<GhostLayer | undefined> {
    const net = await this.getNetwork();
    const cfg = networkByChainId(Number(net.chainId));
    return cfg?.layer;
  }
}
