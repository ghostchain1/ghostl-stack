"use strict";
// ─────────────────────────────────────────────────────────────────────────────
// Provider (abstract) + JsonRpcProvider – ethers v6-compatible
// Wraps GhostProvider and surfaces the ethers API naming conventions.
// ─────────────────────────────────────────────────────────────────────────────
Object.defineProperty(exports, "__esModule", { value: true });
exports.JsonRpcProvider = exports.Provider = void 0;
const GhostProvider_1 = require("../provider/GhostProvider");
const ghostChains_1 = require("../chains/ghostChains");
// ─── Abstract Provider ───────────────────────────────────────────────────────
class Provider {
}
exports.Provider = Provider;
// ─── JsonRpcProvider ─────────────────────────────────────────────────────────
class JsonRpcProvider extends Provider {
    _ghost;
    _url;
    _chainId = null;
    constructor(url) {
        super();
        this._url = url;
        this._ghost = new GhostProvider_1.GhostProvider(url);
    }
    /** Create a provider already connected to a named GhostChain layer. */
    static forLayer(layer, rpcOverride) {
        return new JsonRpcProvider(rpcOverride ?? ghostChains_1.GhostChains[layer].rpc);
    }
    static forL1(rpcOverride) {
        return JsonRpcProvider.forLayer("L1", rpcOverride);
    }
    static forL2(rpcOverride) {
        return JsonRpcProvider.forLayer("L2", rpcOverride);
    }
    static forL3(rpcOverride) {
        return JsonRpcProvider.forLayer("L3", rpcOverride);
    }
    // ─── Network ────────────────────────────────────────────────────────────
    async getNetwork() {
        if (this._chainId === null) {
            this._chainId = await this._ghost.getChainId();
        }
        const chain = Object.values(ghostChains_1.GhostChains).find((c) => c.chainId === this._chainId);
        return {
            name: chain?.name ?? "unknown",
            chainId: BigInt(this._chainId)
        };
    }
    // ─── Block / tx ──────────────────────────────────────────────────────────
    async getBlockNumber() {
        return this._ghost.getBlockNumber();
    }
    async getBalance(address, tag = "latest") {
        return this._ghost.getBalance(address, tag);
    }
    async getTransactionCount(address, tag = "latest") {
        return this._ghost.getTransactionCount(address, tag);
    }
    async getCode(address, tag = "latest") {
        return this._ghost.getCode(address, tag);
    }
    async getBlock(blockTag) {
        return this._ghost.getBlock(blockTag).catch(() => null);
    }
    async getTransaction(hash) {
        return this._ghost.rpc.request("eth_getTransactionByHash", [hash]).catch(() => null);
    }
    async getTransactionReceipt(hash) {
        const raw = await this._ghost.getTransactionReceipt(hash);
        if (!raw)
            return null;
        return _mapReceipt(raw);
    }
    // ─── Call / gas ──────────────────────────────────────────────────────────
    async call(tx) {
        return this._ghost.call({
            to: tx.to ?? "",
            data: typeof tx.data === "string" ? tx.data : "0x",
            from: tx.from,
            value: tx.value !== undefined ? "0x" + BigInt(tx.value).toString(16) : undefined
        });
    }
    async estimateGas(tx) {
        return this._ghost.estimateGas({
            to: tx.to,
            from: tx.from,
            data: typeof tx.data === "string" ? tx.data : "0x",
            value: tx.value !== undefined ? BigInt(tx.value) : undefined
        });
    }
    async getFeeData() {
        const gasPrice = await this._ghost.getGasPrice().catch(() => null);
        if (!gasPrice)
            return { gasPrice: null, maxFeePerGas: null, maxPriorityFeePerGas: null };
        return {
            gasPrice,
            maxFeePerGas: gasPrice * 2n,
            maxPriorityFeePerGas: gasPrice / 10n
        };
    }
    // ─── Logs ────────────────────────────────────────────────────────────────
    async getLogs(filter) {
        const raw = await this._ghost.getLogs(filter);
        return raw.map(_mapLog);
    }
    // ─── Send ────────────────────────────────────────────────────────────────
    async sendRawTransaction(signedTx) {
        return this._ghost.sendRawTransaction(signedTx);
    }
    async waitForTransaction(hash, confirms = 1, timeoutMs = 120_000) {
        const deadline = Date.now() + timeoutMs;
        while (Date.now() < deadline) {
            const receipt = await this.getTransactionReceipt(hash);
            if (receipt && receipt.blockNumber !== null)
                return receipt;
            await new Promise((r) => setTimeout(r, 1_500));
        }
        throw new Error(`Transaction ${hash} not confirmed within ${timeoutMs}ms`);
    }
    /** GNS not available on GhostChain – returns null for all names. */
    async resolveName(name) {
        return null;
    }
    /** Access the underlying GhostProvider for advanced use. */
    get ghost() {
        return this._ghost;
    }
}
exports.JsonRpcProvider = JsonRpcProvider;
// ─── Internal mappers ────────────────────────────────────────────────────────
function _mapReceipt(raw) {
    return {
        hash: raw.transactionHash,
        blockHash: raw.blockHash,
        blockNumber: raw.blockNumber,
        index: 0,
        from: raw.from,
        to: raw.to,
        contractAddress: raw.contractAddress,
        gasUsed: raw.gasUsed,
        cumulativeGasUsed: raw.gasUsed,
        effectiveGasPrice: raw.effectiveGasPrice,
        status: raw.status,
        logs: raw.logs.map(_mapLog),
        logsBloom: "0x",
        type: 2
    };
}
function _mapLog(raw) {
    return {
        address: raw.address,
        topics: raw.topics,
        data: raw.data,
        blockNumber: raw.blockNumber,
        blockHash: raw.blockHash ?? "0x",
        transactionHash: raw.transactionHash,
        transactionIndex: raw.transactionIndex ?? 0,
        logIndex: raw.logIndex,
        removed: raw.removed ?? false
    };
}
