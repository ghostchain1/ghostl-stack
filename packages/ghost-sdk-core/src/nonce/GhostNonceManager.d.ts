import { GhostProvider } from "../provider/GhostProvider";
export declare class GhostNonceManager {
    private provider;
    /** In-memory nonce cache: address → next local nonce */
    private cache;
    /** Pending resolution queue to prevent parallel over-counting */
    private locks;
    constructor(provider: GhostProvider);
    /** Get the next nonce for an address, incrementing the local cache. */
    next(address: string): Promise<number>;
    /** Force-refresh the nonce from the chain (use after a transaction fails). */
    reset(address: string): Promise<void>;
    /** Inspect the current cached nonce without incrementing. */
    peek(address: string): number | undefined;
}
