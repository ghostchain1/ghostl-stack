"use strict";
// ─────────────────────────────────────────────────────────────────────────────
// Wallet – ethers v6-compatible Wallet class
// Wraps GhostWallet + GhostSigner and exposes the ethers API surface.
// Works across GhostChain L1, L2, and L3.
// ─────────────────────────────────────────────────────────────────────────────
Object.defineProperty(exports, "__esModule", { value: true });
exports.Wallet = void 0;
const GhostWallet_1 = require("../wallet/GhostWallet");
const GhostNonceManager_1 = require("../nonce/GhostNonceManager");
const Provider_1 = require("./Provider");
const TypedDataEncoder_1 = require("./TypedDataEncoder");
const ghostChains_1 = require("../chains/ghostChains");
const GhostTransaction_1 = require("../tx/GhostTransaction");
const types_1 = require("./types");
const LAYER_FACTORIES = {
    L1: GhostTransaction_1.makeL1Transaction,
    L2: GhostTransaction_1.makeL2Transaction,
    L3: GhostTransaction_1.makeL3Transaction
};
class Wallet {
    _ghost;
    _provider = null;
    _nonces = null;
    constructor(privateKey, provider) {
        this._ghost = new GhostWallet_1.GhostWallet(privateKey);
        if (provider)
            this._setProvider(provider);
    }
    // ─── Static factories ────────────────────────────────────────────────────
    static createRandom(provider) {
        const w = GhostWallet_1.GhostWallet.generateRandom();
        return new Wallet(w.exportPrivateKey(), provider);
    }
    /** Create from mnemonic is not natively supported; throws with clear message. */
    static fromPhrase(_mnemonic) {
        throw new Error("Wallet.fromPhrase: BIP-39 mnemonic import is not built into ghost-sdk-core. " +
            "Generate a raw private key instead, or use an HD wallet library.");
    }
    /** Convenience: wallet connected to GhostChain L1 / L2 / L3. */
    static forLayer(privateKey, layer, rpcOverride) {
        const provider = Provider_1.JsonRpcProvider.forLayer(layer, rpcOverride);
        return new Wallet(privateKey, provider);
    }
    static forL1(privateKey, rpcOverride) {
        return Wallet.forLayer(privateKey, "L1", rpcOverride);
    }
    static forL2(privateKey, rpcOverride) {
        return Wallet.forLayer(privateKey, "L2", rpcOverride);
    }
    static forL3(privateKey, rpcOverride) {
        return Wallet.forLayer(privateKey, "L3", rpcOverride);
    }
    // ─── Provider management ─────────────────────────────────────────────────
    connect(provider) {
        const w = new Wallet(this._ghost.exportPrivateKey(), provider);
        return w;
    }
    get provider() {
        return this._provider;
    }
    // ─── Identity ────────────────────────────────────────────────────────────
    get address() {
        return this._ghost.address;
    }
    get publicKey() {
        return this._ghost.publicKey;
    }
    get privateKey() {
        return this._ghost.exportPrivateKey();
    }
    // ─── Balances / nonce ────────────────────────────────────────────────────
    async getBalance(tag = "latest") {
        return this._requireProvider().getBalance(this.address, tag);
    }
    async getTransactionCount(tag = "latest") {
        return this._requireProvider().getTransactionCount(this.address, tag);
    }
    // ─── Signing (no broadcast) ──────────────────────────────────────────────
    /** Sign a raw message (EIP-191). Returns 65-byte hex. */
    async signMessage(message) {
        return this._ghost.signMessage(message);
    }
    /** Sign an EIP-712 typed data payload. */
    async signTypedData(domain, types, value) {
        const digest = TypedDataEncoder_1.TypedDataEncoder.hash(domain, types, value);
        // digest is already the 0x-prefixed hash string; sign it as a raw Uint8Array
        const digestBytes = Uint8Array.from(Buffer.from(digest.slice(2), "hex"));
        return this._ghost.signMessage(digestBytes);
    }
    /** Sign a TransactionRequest without broadcasting. Returns raw signed hex. */
    async signTransaction(tx) {
        const layer = await this._detectLayer();
        const factory = LAYER_FACTORIES[layer];
        const nonce = tx.nonce !== undefined
            ? Number((0, types_1.toBigInt)(tx.nonce))
            : await this._nextNonce();
        const feeData = await this._requireProvider().getFeeData();
        const ghostTx = factory({
            to: tx.to,
            from: this.address,
            value: tx.value !== undefined ? (0, types_1.toBigInt)(tx.value) : 0n,
            data: typeof tx.data === "string" ? tx.data : "0x",
            nonce,
            gasLimit: tx.gasLimit !== undefined ? (0, types_1.toBigInt)(tx.gasLimit) : 21000n,
            maxFeePerGas: tx.maxFeePerGas !== undefined ? (0, types_1.toBigInt)(tx.maxFeePerGas) : feeData.maxFeePerGas ?? 2000000000n,
            maxPriorityFeePerGas: tx.maxPriorityFeePerGas !== undefined ? (0, types_1.toBigInt)(tx.maxPriorityFeePerGas) : feeData.maxPriorityFeePerGas ?? 1000000000n,
            accessList: tx.accessList ?? []
        });
        return this._ghost.signTransaction(ghostTx);
    }
    // ─── Send ────────────────────────────────────────────────────────────────
    /** Sign and broadcast a transaction. Returns ContractTransactionResponse. */
    async sendTransaction(tx) {
        const provider = this._requireProvider();
        const raw = await this.signTransaction(tx);
        const hash = await provider.sendRawTransaction(raw);
        return this._buildResponse(hash, tx);
    }
    /** GST transfer shorthand. */
    async sendEther(to, value) {
        return this.sendTransaction({ to, value });
    }
    // ─── Internal ────────────────────────────────────────────────────────────
    _requireProvider() {
        if (!this._provider)
            throw new Error("Wallet: no provider connected. Use wallet.connect(provider).");
        return this._provider;
    }
    _setProvider(provider) {
        this._provider = provider;
        this._nonces = new GhostNonceManager_1.GhostNonceManager(provider.ghost);
    }
    async _detectLayer() {
        const net = await this._requireProvider().getNetwork();
        const chainId = Number(net.chainId);
        for (const [key, cfg] of Object.entries(ghostChains_1.GhostChains)) {
            if (cfg.chainId === chainId)
                return key;
        }
        return "L1"; // default
    }
    async _nextNonce() {
        if (this._nonces)
            return this._nonces.next(this.address);
        return this._requireProvider().getTransactionCount(this.address);
    }
    _buildResponse(hash, tx) {
        const provider = this._requireProvider();
        return {
            hash,
            blockNumber: null,
            blockHash: null,
            from: this.address,
            to: tx.to ?? null,
            nonce: 0,
            gasLimit: tx.gasLimit !== undefined ? (0, types_1.toBigInt)(tx.gasLimit) : 21000n,
            gasPrice: tx.gasPrice !== undefined ? (0, types_1.toBigInt)(tx.gasPrice) : null,
            maxFeePerGas: tx.maxFeePerGas !== undefined ? (0, types_1.toBigInt)(tx.maxFeePerGas) : null,
            maxPriorityFeePerGas: tx.maxPriorityFeePerGas !== undefined ? (0, types_1.toBigInt)(tx.maxPriorityFeePerGas) : null,
            value: tx.value !== undefined ? (0, types_1.toBigInt)(tx.value) : 0n,
            data: typeof tx.data === "string" ? tx.data : "0x",
            chainId: 0n,
            type: 2,
            wait: async (confirms = 1) => provider.waitForTransaction(hash, confirms),
            toJSON: () => ({ hash, to: tx.to, from: this.address })
        };
    }
}
exports.Wallet = Wallet;
