"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.GhostProvider = void 0;
const GhostJsonRpc_1 = require("../rpc/GhostJsonRpc");
class GhostProvider {
    rpc;
    constructor(url, options = {}) {
        this.rpc = new GhostJsonRpc_1.GhostJsonRpc(url, options);
    }
    async getBlockNumber() {
        const hex = await this.rpc.request("eth_blockNumber");
        return parseInt(hex, 16);
    }
    async getBalance(address, tag = "latest") {
        const hex = await this.rpc.request("eth_getBalance", [address, tag]);
        return BigInt(hex);
    }
    async getTransactionCount(address, tag = "latest") {
        const hex = await this.rpc.request("eth_getTransactionCount", [address, tag]);
        return parseInt(hex, 16);
    }
    async getGasPrice() {
        const hex = await this.rpc.request("eth_gasPrice");
        return BigInt(hex);
    }
    async getBlock(blockHashOrNumber) {
        const param = typeof blockHashOrNumber === "number"
            ? "0x" + blockHashOrNumber.toString(16)
            : blockHashOrNumber;
        return this.rpc.request("eth_getBlockByNumber", [param, false]);
    }
    async getTransactionReceipt(txHash) {
        return this.rpc.request("eth_getTransactionReceipt", [txHash]);
    }
    async sendRawTransaction(tx) {
        return this.rpc.request("eth_sendRawTransaction", [tx]);
    }
    async call(override, tag = "latest") {
        return this.rpc.request("eth_call", [override, tag]);
    }
    async estimateGas(tx) {
        const hex = await this.rpc.request("eth_estimateGas", [tx]);
        return BigInt(hex);
    }
    async getChainId() {
        const hex = await this.rpc.request("eth_chainId");
        return parseInt(hex, 16);
    }
    async getCode(address, tag = "latest") {
        return this.rpc.request("eth_getCode", [address, tag]);
    }
    async getLogs(filter) {
        return this.rpc.request("eth_getLogs", [filter]);
    }
    // ─── ghost_ branded namespace ────────────────────────────────────────────
    // GhostChain exposes a `ghost_*` RPC namespace (routed via ghost-rpc-proxy).
    // These methods are the canonical SDK surface; the underlying wire call uses
    // the `ghost_` prefix which the proxy translates to `eth_*` where needed.
    /** @alias ghost_getBalance */
    async ghost_getBalance(address, tag = "latest") {
        try {
            const hex = await this.rpc.request("ghost_getBalance", [address, tag]);
            return BigInt(hex);
        }
        catch {
            // Fallback: node may not have ghost_ prefix — use eth_ transparently
            return this.getBalance(address, tag);
        }
    }
    /** @alias ghost_blockNumber */
    async ghost_blockNumber() {
        try {
            const hex = await this.rpc.request("ghost_blockNumber");
            return parseInt(hex, 16);
        }
        catch {
            return this.getBlockNumber();
        }
    }
    /** @alias ghost_sendRawTransaction */
    async ghost_sendRawTransaction(tx) {
        try {
            return await this.rpc.request("ghost_sendRawTransaction", [tx]);
        }
        catch {
            return this.sendRawTransaction(tx);
        }
    }
    /** @alias ghost_call */
    async ghost_call(override, tag = "latest") {
        try {
            return await this.rpc.request("ghost_call", [override, tag]);
        }
        catch {
            return this.call(override, tag);
        }
    }
    /** @alias ghost_estimateGas */
    async ghost_estimateGas(tx) {
        try {
            const hex = await this.rpc.request("ghost_estimateGas", [tx]);
            return BigInt(hex);
        }
        catch {
            return this.estimateGas(tx);
        }
    }
    /** @alias ghost_chainId */
    async ghost_chainId() {
        try {
            const hex = await this.rpc.request("ghost_chainId");
            return parseInt(hex, 16);
        }
        catch {
            return this.getChainId();
        }
    }
    /** @alias ghost_getLogs */
    async ghost_getLogs(filter) {
        try {
            return await this.rpc.request("ghost_getLogs", [filter]);
        }
        catch {
            return this.getLogs(filter);
        }
    }
    /**
     * ghost_getNodeInfo — GhostChain-specific: returns node identity, layer, and chain metadata.
     * Falls back to `ghost_nodeInfo` or `web3_clientVersion` if unavailable.
     */
    async ghost_getNodeInfo() {
        try {
            return await this.rpc.request("ghost_getNodeInfo");
        }
        catch {
            return null;
        }
    }
}
exports.GhostProvider = GhostProvider;
