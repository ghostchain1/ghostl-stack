/**
 * GhostNonceManager — nonce tracking and management for GhostChain.
 *
 * Maintains a local nonce cache per account + provider to avoid nonce
 * collisions when sending multiple transactions concurrently.
 * Supports automatic resync from the chain on failure.
 */

import type { GhostAddress } from "../native/types.js";
import type { HttpProvider } from "../providers/HttpProvider.js";
import { GhostValidationError } from "../errors/GhostErrors.js";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface GhostNonceManagerOptions {
  /**
   * Whether to eagerly resync nonce on each request instead of using cache.
   * Safer but slower. Default: false.
   */
  alwaysResync?: boolean;
  /**
   * Nonce tag to fetch from chain. Default: "pending" (includes pending txs).
   */
  blockTag?: "latest" | "pending";
}

// ── GhostNonceManager ─────────────────────────────────────────────────────────

/**
 * Manages nonces for one or more accounts across a single JSON-RPC provider.
 *
 * ```ts
 * const nonces = new GhostNonceManager(provider);
 * const nonce  = await nonces.next(address);    // returns and increments
 * await nonces.resync(address);                 // reload from chain
 * ```
 */
export class GhostNonceManager {
  private readonly cache = new Map<string, number>();
  private readonly alwaysResync: boolean;
  private readonly blockTag: "latest" | "pending";
  private readonly pending = new Map<string, Promise<number>>();

  constructor(
    private readonly provider: HttpProvider,
    opts: GhostNonceManagerOptions = {},
  ) {
    this.alwaysResync = opts.alwaysResync ?? false;
    this.blockTag = opts.blockTag ?? "pending";
  }

  private cacheKey(address: GhostAddress): string {
    return address.toLowerCase();
  }

  /**
   * Get the next nonce for `address` and advance the local counter.
   *
   * Safe to call concurrently — concurrent calls serialize via an in-flight
   * promise so each caller gets a unique, sequential nonce.
   */
  async next(address: GhostAddress): Promise<number> {
    const key = this.cacheKey(address);

    // Serialize concurrent access per account
    const inFlight = this.pending.get(key);
    const acquire = async (): Promise<number> => {
      if (inFlight) await inFlight.catch(() => undefined);

      if (this.alwaysResync || !this.cache.has(key)) {
        await this.resync(address);
      }

      const current = this.cache.get(key)!;
      this.cache.set(key, current + 1);
      return current;
    };

    const p = acquire();
    this.pending.set(key, p);
    const result = await p;
    this.pending.delete(key);
    return result;
  }

  /**
   * Peek at the current cached nonce without advancing it.
   * Returns `undefined` if not yet fetched.
   */
  peek(address: GhostAddress): number | undefined {
    return this.cache.get(this.cacheKey(address));
  }

  /**
   * Resync the nonce cache from the chain for `address`.
   */
  async resync(address: GhostAddress): Promise<void> {
    const nonce = await this.provider.getTransactionCount(address, this.blockTag);
    this.cache.set(this.cacheKey(address), nonce);
  }

  /**
   * Manually set the cached nonce for `address`.
   * Use this after a transaction failure to correct the local counter.
   */
  set(address: GhostAddress, nonce: number): void {
    if (nonce < 0) throw new GhostValidationError("nonce cannot be negative");
    this.cache.set(this.cacheKey(address), nonce);
  }

  /**
   * Decrement the cached nonce for `address` by 1.
   * Use this after a transaction failure to "unconsume" the nonce.
   */
  decrement(address: GhostAddress): void {
    const key = this.cacheKey(address);
    const current = this.cache.get(key);
    if (current === undefined || current === 0) return;
    this.cache.set(key, current - 1);
  }

  /**
   * Clear cached nonce for `address`, forcing a resync on next call.
   */
  clear(address: GhostAddress): void {
    this.cache.delete(this.cacheKey(address));
  }

  /**
   * Clear all cached nonces.
   */
  clearAll(): void {
    this.cache.clear();
  }

  // ── Static helpers ────────────────────────────────────────────────────────

  /**
   * Create a dedicated nonce manager scoped to a single address.
   *
   * ```ts
   * const nm = GhostNonceManager.forAccount(provider, myAddress);
   * const nonce = await nm.next();
   * ```
   */
  static forAccount(
    provider: HttpProvider,
    address: GhostAddress,
    opts?: GhostNonceManagerOptions,
  ): BoundNonceManager {
    return new BoundNonceManager(new GhostNonceManager(provider, opts), address);
  }
}

// ── BoundNonceManager ─────────────────────────────────────────────────────────

/**
 * A nonce manager bound to a single address.
 */
export class BoundNonceManager {
  constructor(
    private readonly manager: GhostNonceManager,
    private readonly address: GhostAddress,
  ) {}

  async next(): Promise<number> {
    return this.manager.next(this.address);
  }
  peek(): number | undefined {
    return this.manager.peek(this.address);
  }
  async resync(): Promise<void> {
    return this.manager.resync(this.address);
  }
  set(nonce: number): void {
    this.manager.set(this.address, nonce);
  }
  decrement(): void {
    this.manager.decrement(this.address);
  }
  clear(): void {
    this.manager.clear(this.address);
  }
}
