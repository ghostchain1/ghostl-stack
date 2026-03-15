"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.GhostNonceManager = void 0;
class GhostNonceManager {
    provider;
    /** In-memory nonce cache: address → next local nonce */
    cache = new Map();
    /** Pending resolution queue to prevent parallel over-counting */
    locks = new Map();
    constructor(provider) {
        this.provider = provider;
    }
    /** Get the next nonce for an address, incrementing the local cache. */
    async next(address) {
        const key = address.toLowerCase();
        // Wait for any in-flight nonce resolution for this address
        if (this.locks.has(key)) {
            await this.locks.get(key);
        }
        let resolve;
        const lock = new Promise((res) => { resolve = res; });
        this.locks.set(key, lock);
        try {
            if (!this.cache.has(key)) {
                const onChain = await this.provider.getTransactionCount(address);
                this.cache.set(key, onChain);
            }
            const nonce = this.cache.get(key);
            this.cache.set(key, nonce + 1);
            resolve(nonce);
            return nonce;
        }
        catch (err) {
            resolve(-1);
            throw err;
        }
        finally {
            this.locks.delete(key);
        }
    }
    /** Force-refresh the nonce from the chain (use after a transaction fails). */
    async reset(address) {
        const key = address.toLowerCase();
        const onChain = await this.provider.getTransactionCount(address);
        this.cache.set(key, onChain);
    }
    /** Inspect the current cached nonce without incrementing. */
    peek(address) {
        return this.cache.get(address.toLowerCase());
    }
}
exports.GhostNonceManager = GhostNonceManager;
