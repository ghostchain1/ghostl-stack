/**
 * GNSCache — in-process TTL-aware cache for GNS name resolutions.
 *
 * Prevents redundant network / on-chain lookups by caching resolved
 * `.ghost` names locally with configurable TTLs.
 *
 * Usage:
 *   const cache = new GNSCache({ defaultTtlMs: 60_000 });
 *   cache.set("treasury.ghost", "0xAbCd...");
 *   cache.get("treasury.ghost"); // → "0xAbCd..."
 */

// ── Types ─────────────────────────────────────────────────────────────────────

export interface GNSCacheEntry {
  address:   string;
  cachedAt:  number;
  ttlMs:     number;
}

export interface GNSCacheConfig {
  /** Default TTL for entries in milliseconds. Default: 300_000 (5 min) */
  defaultTtlMs?: number;
  /** Max number of entries before LRU eviction. Default: 1000 */
  maxEntries?: number;
}

// ── GNSCache ──────────────────────────────────────────────────────────────────

export class GNSCache {
  private readonly store:       Map<string, GNSCacheEntry> = new Map();
  private readonly defaultTtlMs: number;
  private readonly maxEntries:   number;

  constructor(config: GNSCacheConfig = {}) {
    this.defaultTtlMs = config.defaultTtlMs ?? 300_000;
    this.maxEntries   = config.maxEntries   ?? 1_000;
  }

  /**
   * Store a resolved address for a GNS name.
   *
   * @param name    The `.ghost` name (stored lowercase).
   * @param address The resolved address.
   * @param ttlMs   Optional per-entry TTL, overrides `defaultTtlMs`.
   */
  set(name: string, address: string, ttlMs?: number): void {
    const key = name.toLowerCase();

    // LRU eviction: remove oldest entry before inserting
    if (this.store.size >= this.maxEntries && !this.store.has(key)) {
      const oldest = this.store.keys().next().value;
      if (oldest !== undefined) this.store.delete(oldest);
    }

    // Re-insert at end (Map preserves insertion order)
    this.store.delete(key);
    this.store.set(key, {
      address,
      cachedAt: Date.now(),
      ttlMs:    ttlMs ?? this.defaultTtlMs,
    });
  }

  /**
   * Get a cached address for a name.
   * Returns `null` if not found or if the entry has expired.
   */
  get(name: string): string | null {
    const key   = name.toLowerCase();
    const entry = this.store.get(key);
    if (!entry) return null;

    if (Date.now() - entry.cachedAt > entry.ttlMs) {
      this.store.delete(key);
      return null;
    }

    // Refresh position in LRU map
    this.store.delete(key);
    this.store.set(key, entry);
    return entry.address;
  }

  /** Remove a specific entry. */
  delete(name: string): void {
    this.store.delete(name.toLowerCase());
  }

  /** Remove all expired entries. */
  evictExpired(): number {
    const now = Date.now();
    let count = 0;
    for (const [key, entry] of this.store) {
      if (now - entry.cachedAt > entry.ttlMs) {
        this.store.delete(key);
        count++;
      }
    }
    return count;
  }

  /** Clear the entire cache. */
  clear(): void {
    this.store.clear();
  }

  /** Number of cached entries (including potentially expired). */
  get size(): number {
    return this.store.size;
  }

  /** Check if a name has a live (non-expired) cache entry. */
  has(name: string): boolean {
    return this.get(name) !== null;
  }

  /** List all non-expired cached names. */
  names(): string[] {
    const now = Date.now();
    return Array.from(this.store.entries())
      .filter(([, e]) => now - e.cachedAt <= e.ttlMs)
      .map(([k]) => k);
  }
}
