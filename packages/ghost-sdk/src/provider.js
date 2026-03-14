"use strict";
/**
 * ghostJsonRpcProvider
 *
 * Extends ghost v6 JsonRpcProvider with:
 *  - Layer awareness (L1 / L2 / L3)
 *  - gst_* method canonicalisation (falls back to eth_* when not supported)
 *  - GST balance helpers
 *  - Network info metadata
 *  - Automatic network config from GhostNetworks if no explicit network is passed
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.ghostJsonRpcProvider = void 0;
exports.createL1Provider = createL1Provider;
exports.createL2Provider = createL2Provider;
exports.createL3Provider = createL3Provider;
exports.createAllLayerProviders = createAllLayerProviders;
const ethers_1 = require("ethers");
const networks_js_1 = require("./networks.js");
// ─── helpers ────────────────────────────────────────────────────────────────
function isMethodNotFound(err) {
    const code = err?.code;
    if (code === -32601)
        return true;
    const msg = String(err?.message ?? "")
        .toLowerCase();
    return (msg.includes("method not found") ||
        msg.includes("does not exist") ||
        msg.includes("not available"));
}
// ─── provider ───────────────────────────────────────────────────────────────
class ghostJsonRpcProvider extends ethers_1.JsonRpcProvider {
    /** Which layer of the GhostStack this provider is connected to. */
    layer;
    /**
     * @param url     JSON-RPC endpoint URL.  Defaults to the local dev RPC for
     *                the given layer (from GhostNetworks / env vars).
     * @param layer   "L1" | "L2" | "L3".  Defaults to "L1".
     * @param network Optional ghost Network override.  When omitted the
     *                provider fetches the chain ID from the node on first use.
     */
    constructor(url, layer = "L1", network) {
        const cfg = networks_js_1.GhostNetworks[layer];
        const rpc = url ?? cfg.rpc;
        // Build an ghost Network when the caller didn't supply one.
        const net = network instanceof ethers_1.Network
            ? network
            : new ethers_1.Network(network?.name ?? cfg.name, network?.chainId ?? cfg.chainId);
        super(rpc, net, { staticNetwork: net });
        this.layer = layer;
    }
    // ── GhostChain-specific metadata ──────────────────────────────────────────
    /** Returns the GhostStack layer ("L1" | "L2" | "L3"). */
    getLayer() {
        return this.layer;
    }
    /** Returns the native gas token symbol ("GST"). */
    // eslint-disable-next-line @typescript-eslint/require-await
    async getGasToken() {
        return "GST";
    }
    /**
     * Returns high-level network metadata for this provider.
     * Also resolves the live chain ID from the node to confirm connectivity.
     */
    async getGhostNetworkInfo() {
        const net = await super.getNetwork();
        const liveChainId = Number(net.chainId);
        const knownConfig = (0, networks_js_1.networkByChainId)(liveChainId) ?? networks_js_1.GhostNetworks[this.layer];
        return { ...knownConfig, layer: this.layer, liveChainId };
    }
    // ── Canonical gst_* / eth_* method routing ────────────────────────────────
    /**
     * Calls a gst_* method first; if the node returns method-not-found it
     * transparently retries with the equivalent eth_* method.
     *
     * Example: gst_blockNumber → eth_blockNumber
     */
    async sendGstMethod(gstMethod, ethMethod, params = []) {
        try {
            return await super.send(gstMethod, params);
        }
        catch (err) {
            if (!isMethodNotFound(err))
                throw err;
            return await super.send(ethMethod, params);
        }
    }
    /** Canonical block number (tries gst_blockNumber, falls back to eth_blockNumber). */
    async getGhostBlockNumber() {
        const hex = await this.sendGstMethod("gst_blockNumber", "eth_blockNumber");
        return parseInt(hex, 16);
    }
    /** GST balance (wei) of address – alias for getBalance with GST branding. */
    async getGSTBalance(address) {
        return super.getBalance(address);
    }
    /** GST balance formatted in GST units (not wei). */
    async getGSTBalanceFormatted(address) {
        const wei = await this.getGSTBalance(address);
        // 18-decimal formatting without importing ghost formatUnits
        const whole = wei / 10n ** 18n;
        const frac = String(wei % 10n ** 18n).padStart(18, "0").replace(/0+$/, "") || "0";
        return `${whole}.${frac} GST`;
    }
}
exports.ghostJsonRpcProvider = ghostJsonRpcProvider;
// ─── factory helpers ─────────────────────────────────────────────────────────
/** Create a provider for GhostChain L1. */
function createL1Provider(url) {
    return new ghostJsonRpcProvider(url, "L1");
}
/** Create a provider for GhostL2. */
function createL2Provider(url) {
    return new ghostJsonRpcProvider(url, "L2");
}
/** Create a provider for GhostL3. */
function createL3Provider(url) {
    return new ghostJsonRpcProvider(url, "L3");
}
/**
 * Create one provider per layer, keyed by layer name.
 *
 * ```ts
 * const { L1, L2, L3 } = createAllLayerProviders();
 * ```
 */
function createAllLayerProviders(urls) {
    return {
        L1: createL1Provider(urls?.L1),
        L2: createL2Provider(urls?.L2),
        L3: createL3Provider(urls?.L3),
    };
}
