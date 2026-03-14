"use strict";
/**
 * GhostWallet
 *
 * Extends ghost v6 Wallet with GhostStack layer awareness.
 * Works with ghostJsonRpcProvider out of the box.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.GhostWallet = void 0;
exports.ghostWalletFromMnemonic = ghostWalletFromMnemonic;
exports.createRandomGhostWallet = createRandomGhostWallet;
const ethers_1 = require("ethers");
const provider_js_1 = require("./provider.js");
const networks_js_1 = require("./networks.js");
class GhostWallet extends ethers_1.Wallet {
    /** The GhostStack layer this wallet targets. */
    layer;
    constructor(privateKey, providerOrLayer, layer) {
        let resolvedLayer;
        let resolvedProvider;
        if (providerOrLayer instanceof provider_js_1.ghostJsonRpcProvider) {
            resolvedProvider = providerOrLayer;
            resolvedLayer = providerOrLayer.layer;
        }
        else if (typeof providerOrLayer === "string") {
            resolvedLayer = providerOrLayer;
            resolvedProvider = new provider_js_1.ghostJsonRpcProvider(undefined, resolvedLayer);
        }
        else {
            resolvedLayer = layer ?? "L1";
            resolvedProvider = new provider_js_1.ghostJsonRpcProvider(undefined, resolvedLayer);
        }
        const pk = typeof privateKey === "string" ? privateKey : privateKey.privateKey;
        super(pk, resolvedProvider);
        this.layer = resolvedLayer;
    }
    /** Switch this wallet to a different GhostStack layer, returning a new instance. */
    connectToLayer(layer, url) {
        const provider = new provider_js_1.ghostJsonRpcProvider(url, layer);
        return new GhostWallet(this.privateKey, provider);
    }
    /** Convenience: get GST balance in wei for this wallet's address. */
    async getGSTBalance() {
        if (!this.provider)
            throw new Error("No provider attached to GhostWallet");
        return this.provider.getBalance(this.address);
    }
    /** Returns `{ address, layer, chainId }` identification for this wallet. */
    async identify() {
        const chainId = Number((await this.provider?.getNetwork())?.chainId ?? networks_js_1.GhostNetworks[this.layer].chainId);
        return { address: this.address, layer: this.layer, chainId };
    }
}
exports.GhostWallet = GhostWallet;
// ─── factory helpers ─────────────────────────────────────────────────────────
/**
 * Create a GhostWallet from a mnemonic phrase.
 *
 * ```ts
 * const wallet = ghostWalletFromMnemonic("word1 word2 ...", "L2");
 * ```
 */
function ghostWalletFromMnemonic(mnemonic, layer = "L1", path = "m/44'/60'/0'/0/0", url) {
    const inner = ethers_1.Wallet.fromPhrase(mnemonic);
    const provider = new provider_js_1.ghostJsonRpcProvider(url, layer);
    return new GhostWallet(inner.privateKey, provider);
}
/**
 * Create a random GhostWallet on the given layer.
 *
 * ```ts
 * const wallet = createRandomGhostWallet("L3");
 * ```
 */
function createRandomGhostWallet(layer = "L1", url) {
    const inner = ethers_1.Wallet.createRandom();
    const provider = new provider_js_1.ghostJsonRpcProvider(url, layer);
    return new GhostWallet(inner.privateKey, provider);
}
