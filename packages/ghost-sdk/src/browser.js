"use strict";
/**
 * GhostBrowserProvider
 *
 * Extends ghost v6 BrowserProvider (window.ethereum / EIP-1193) with
 * GhostStack layer awareness.  Import this only in browser / Next.js bundles.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.GhostBrowserProvider = void 0;
const ethers_1 = require("ethers");
const networks_js_1 = require("./networks.js");
class GhostBrowserProvider extends ethers_1.BrowserProvider {
    _layer;
    constructor(ethereum, layer = "L1") {
        super(ethereum, "any");
        this._layer = layer;
    }
    /** The configured GhostStack layer for this browser session. */
    getLayer() {
        return this._layer;
    }
    /**
     * Request the user's wallet to switch to the given GhostStack layer.
     * Calls wallet_switchEthereumChain; if the chain is not known to the wallet,
     * calls wallet_addEthereumChain automatically.
     */
    async switchToLayer(layer) {
        const cfg = networks_js_1.GhostNetworks[layer];
        const chainIdHex = "0x" + cfg.chainId.toString(16);
        try {
            await this.send("wallet_switchEthereumChain", [{ chainId: chainIdHex }]);
        }
        catch (err) {
            // 4902: chain not added yet
            const code = err.code;
            if (code !== 4902)
                throw err;
            await this.send("wallet_addEthereumChain", [
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
    async getActiveLayer() {
        const net = await this.getNetwork();
        const cfg = (0, networks_js_1.networkByChainId)(Number(net.chainId));
        return cfg?.layer;
    }
}
exports.GhostBrowserProvider = GhostBrowserProvider;
