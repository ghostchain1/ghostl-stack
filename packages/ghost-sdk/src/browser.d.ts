/**
 * GhostBrowserProvider
 *
 * Extends ghost v6 BrowserProvider (EIP-1193) with
 * GhostStack layer awareness.  Import this only in browser / Next.js bundles.
 */
import { BrowserProvider, type Eip1193Provider } from "ethers";
import { type GhostLayer } from "./networks.js";
export declare class GhostBrowserProvider extends BrowserProvider {
    private _layer;
    constructor(provider: Eip1193Provider, layer?: GhostLayer);
    /** The configured GhostStack layer for this browser session. */
    getLayer(): GhostLayer;
    /**
     * Request the user's wallet to switch to the given GhostStack layer.
     * Calls wallet_switchEthereumChain; if the chain is not known to the wallet,
     * calls wallet_addEthereumChain automatically.
     */
    switchToLayer(layer: GhostLayer): Promise<void>;
    /**
     * Read the chain currently active in the wallet and return the matching
     * GhostStack layer, if known.
     */
    getActiveLayer(): Promise<GhostLayer | undefined>;
}
//# sourceMappingURL=browser.d.ts.map