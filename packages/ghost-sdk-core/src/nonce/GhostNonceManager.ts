// ─────────────────────────────────────────────────────────────────────────────
// GhostNonceManager – Per-address nonce tracking with race-condition safety
// ─────────────────────────────────────────────────────────────────────────────
import { GhostProvider } from "../provider/GhostProvider";

export class GhostNonceManager {
  /** In-memory nonce cache: address → next local nonce */
  private cache = new Map<string, number>();
  /** Pending resolution queue to prevent parallel over-counting */
  private locks = new Map<string, Promise<number>>();

  constructor(private provider: GhostProvider) {}

  /** Get the next nonce for an address, incrementing the local cache. */
  async next(address: string): Promise<number> {
    const key = address.toLowerCase();

    // Wait for any in-flight nonce resolution for this address
    if (this.locks.has(key)) {
      await this.locks.get(key);
    }

    let resolve!: (n: number) => void;
    const lock = new Promise<number>((res) => { resolve = res; });
    this.locks.set(key, lock);

    try {
      if (!this.cache.has(key)) {
        const onChain = await this.provider.getTransactionCount(address);
        this.cache.set(key, onChain);
      }
      const nonce = this.cache.get(key)!;
      this.cache.set(key, nonce + 1);
      resolve(nonce);
      return nonce;
    } catch (err) {
      resolve(-1);
      throw err;
    } finally {
      this.locks.delete(key);
    }
  }

  /** Force-refresh the nonce from the chain (use after a transaction fails). */
  async reset(address: string): Promise<void> {
    const key = address.toLowerCase();
    const onChain = await this.provider.getTransactionCount(address);
    this.cache.set(key, onChain);
  }

  /** Inspect the current cached nonce without incrementing. */
  peek(address: string): number | undefined {
    return this.cache.get(address.toLowerCase());
  }
}
