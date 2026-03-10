"use strict";
// ─────────────────────────────────────────────────────────────────────────────
// GhostSigner – High-level sign-and-send for GhostChain L1 / L2 / L3
//
// Combines: GhostWallet + GhostProvider + GhostNonceManager + GhostGasEngine
// into a single ergonomic interface, one per chain layer.
// ─────────────────────────────────────────────────────────────────────────────
Object.defineProperty(exports, "__esModule", { value: true });
exports.GhostSigner = void 0;
exports.createSigners = createSigners;
const GhostWallet_1 = require("../wallet/GhostWallet");
const GhostProvider_1 = require("../provider/GhostProvider");
const GhostTransaction_1 = require("./GhostTransaction");
const GhostNonceManager_1 = require("../nonce/GhostNonceManager");
const GhostGasEngine_1 = require("../gas/GhostGasEngine");
const ghostChains_1 = require("../chains/ghostChains");
const FACTORY = {
    L1: GhostTransaction_1.makeL1Transaction,
    L2: GhostTransaction_1.makeL2Transaction,
    L3: GhostTransaction_1.makeL3Transaction
};
class GhostSigner {
    wallet;
    provider;
    layer;
    nonces;
    gas;
    constructor(wallet, layer, rpcOverride) {
        this.wallet = wallet;
        this.layer = layer;
        this.provider = new GhostProvider_1.GhostProvider(rpcOverride ?? ghostChains_1.GhostChains[layer].rpc);
        this.nonces = new GhostNonceManager_1.GhostNonceManager(this.provider);
        this.gas = new GhostGasEngine_1.GhostGasEngine(this.provider);
    }
    // ─── Core: sign ──────────────────────────────────────────────────────────
    /**
     * Build, fill, and sign an EIP-1559 transaction.
     * Returns the 0x-prefixed raw transaction hex.
     */
    async sign(params) {
        const [nonce, feeData] = await Promise.all([
            params.nonce !== undefined
                ? Promise.resolve(params.nonce)
                : this.nonces.next(this.wallet.address),
            this.gas.getFeeData()
        ]);
        const tx = FACTORY[this.layer]({
            to: params.to,
            value: params.value ?? 0n,
            data: params.data ?? "0x",
            nonce,
            gasLimit: params.gasLimit ?? 21000n,
            maxFeePerGas: params.maxFeePerGas ?? feeData.maxFeePerGas,
            maxPriorityFeePerGas: params.maxPriorityFeePerGas ?? feeData.maxPriorityFeePerGas,
            accessList: params.accessList ?? [],
            from: this.wallet.address
        });
        return this.wallet.signTransaction(tx);
    }
    // ─── Core: send ──────────────────────────────────────────────────────────
    /**
     * Sign and broadcast. Returns the transaction hash.
     */
    async send(params) {
        const raw = await this.sign(params);
        return this.provider.sendRawTransaction(raw);
    }
    /**
     * Sign, broadcast, and wait for first confirmation.
     * Returns the TransactionReceipt.
     */
    async sendAndWait(params, timeoutMs = 120_000) {
        const hash = await this.send(params);
        return this._waitForReceipt(hash, timeoutMs);
    }
    // ─── Utility ─────────────────────────────────────────────────────────────
    /** Current on-chain balance of the signer address. */
    balance() {
        return this.provider.getBalance(this.wallet.address);
    }
    /** GST transfer shorthand. */
    sendEther(to, value) {
        return this.send({ to, value });
    }
    // ─── Private ─────────────────────────────────────────────────────────────
    async _waitForReceipt(hash, timeoutMs) {
        const deadline = Date.now() + timeoutMs;
        while (Date.now() < deadline) {
            const receipt = await this.provider.getTransactionReceipt(hash).catch(() => null);
            if (receipt)
                return receipt;
            await new Promise((r) => setTimeout(r, 1_500));
        }
        throw new Error(`Transaction ${hash} not confirmed within ${timeoutMs}ms`);
    }
}
exports.GhostSigner = GhostSigner;
function createSigners(privateKey, rpcOverrides) {
    const wallet = new GhostWallet_1.GhostWallet(privateKey);
    return {
        L1: new GhostSigner(wallet, "L1", rpcOverrides?.L1),
        L2: new GhostSigner(wallet, "L2", rpcOverrides?.L2),
        L3: new GhostSigner(wallet, "L3", rpcOverrides?.L3)
    };
}
