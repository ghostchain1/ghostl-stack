"use strict";
/**
 * GhostBridgeProvider
 *
 * Multi-layer provider that holds one ghostJsonRpcProvider per layer and
 * automatically routes calls to the correct chain.
 *
 * Implements the GhostStack derivation rule:  L3 → L2 → L1
 *
 * Usage:
 *   const bridge = new GhostBridgeProvider();
 *   const block  = await bridge.L2.getGhostBlockNumber();
 *   const info   = await bridge.getRouteInfo();
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.GhostBridgeProvider = void 0;
const provider_js_1 = require("./provider.js");
const networks_js_1 = require("./networks.js");
class GhostBridgeProvider {
    /** L1 provider (GhostChain) */
    L1;
    /** L2 provider (GhostL2) */
    L2;
    /** L3 provider (GhostL3) */
    L3;
    constructor(urls) {
        this.L1 = (0, provider_js_1.createL1Provider)(urls?.L1);
        this.L2 = (0, provider_js_1.createL2Provider)(urls?.L2);
        this.L3 = (0, provider_js_1.createL3Provider)(urls?.L3);
    }
    /** Get the provider for a specific layer. */
    forLayer(layer) {
        return this[layer];
    }
    /**
     * Returns route info for every layer in the derivation order L1 → L2 → L3.
     * Useful for dashboards and health checks.
     */
    async getRouteInfo() {
        const results = await Promise.allSettled(networks_js_1.DERIVATION_PATH.map(async (layer) => {
            const provider = this.forLayer(layer);
            const [net, blockNumber] = await Promise.all([
                provider.getNetwork(),
                provider.getGhostBlockNumber(),
            ]);
            return {
                layer,
                chainId: Number(net.chainId),
                blockNumber,
                parentLayer: (0, networks_js_1.parentLayer)(layer),
            };
        }));
        return results.map((r, i) => {
            if (r.status === "fulfilled")
                return r.value;
            const layer = networks_js_1.DERIVATION_PATH[i];
            return {
                layer,
                chainId: -1,
                blockNumber: -1,
                parentLayer: (0, networks_js_1.parentLayer)(layer),
            };
        });
    }
    /**
     * Submit a raw signed transaction to the appropriate layer.
     *
     * For L2/L3 this goes directly to the sequencer.
     * For L1 it goes to the Anvil / Ethereum node.
     */
    async sendRawTransaction(layer, signedTx) {
        return this.forLayer(layer).send("eth_sendRawTransaction", [signedTx]);
    }
    /**
     * Broadcast the same signed tx to all layers simultaneously.
     * Only one will accept it (the one matching the tx chain ID).
     * Returns a record of { layer → txHash | errorMessage }.
     */
    async broadcastToAll(signedTx) {
        const entries = await Promise.allSettled(networks_js_1.DERIVATION_PATH.map(async (layer) => {
            const hash = await this.sendRawTransaction(layer, signedTx);
            return [layer, hash];
        }));
        return Object.fromEntries(entries.map((r, i) => r.status === "fulfilled"
            ? r.value
            : [networks_js_1.DERIVATION_PATH[i], `error: ${r.reason.message}`]));
    }
}
exports.GhostBridgeProvider = GhostBridgeProvider;
