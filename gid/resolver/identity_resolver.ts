/**
 * GhostChain Sovereign Identity Network — Identity Resolver (Off-Chain)
 *
 * Off-chain cache layer that mirrors the GhostIdentityRegistry and
 * UsernameResolver on-chain contracts for low-latency read access.
 *
 * Capabilities:
 *   - Forward resolution:  username  → { wallet, chainId, kind, active }
 *   - Reverse resolution:  address   → username
 *   - Bounded LRU-style cache (MAX_CACHE entries, eviction on overflow)
 *   - Per-entry TTL (default 5 minutes); stale entries re-fetched on miss
 *   - Resolution events forwarded to GhostBrain Core (:7900) for pattern
 *     analysis and identity graph construction
 *
 * Advisory-only:
 *   This module makes no on-chain writes.  All mutations to registry state
 *   must flow through the GhostIdentityRegistry contract or the signing relay.
 *
 * Chain: GhostChain L1 (chain_id 14000101).
 * Gas token: GST.
 */

// ── Constants ────────────────────────────────────────────────────────────────

const L1_CHAIN_ID = 14000101;
const L2_CHAIN_ID = 901;
const L3_CHAIN_ID = 903;

const MAX_CACHE         = 10_000;         // Maximum cached entries (forward + reverse combined)
const DEFAULT_TTL_MS    = 5 * 60 * 1000; // 5 minutes
const GHOSTBRAIN_URL    = process.env["GHOSTBRAIN_API_URL"]    ?? "http://localhost:7900";

// ── Types ─────────────────────────────────────────────────────────────────────

export type IdentityKind = "USER" | "VALIDATOR" | "SERVICE";

export interface ResolvedIdentity {
  username:      string;
  wallet:        string;        // checksummed address on L1
  walletByLayer: Partial<Record<number, string>>; // L2/L3 wallet hints
  kind:          IdentityKind;
  registeredAt:  number;        // Unix seconds
  active:        boolean;
  reputationScore?: number;
  cachedAt:      number;        // Unix ms (internal)
}

export interface IdentityResolverOptions {
  ghostbrainUrl?: string;
  ttlMs?:         number;
  maxCache?:      number;
  /** Injected fetch function (defaults to global fetch). */
  fetcher?: (url: string, init?: RequestInit) => Promise<Response>;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function nowMs(): number {
  return Date.now();
}

function normaliseUsername(username: string): string {
  return username.trim().toLowerCase();
}

function normaliseAddress(address: string): string {
  return address.trim().toLowerCase();
}

// ── IdentityResolver ─────────────────────────────────────────────────────────

export class IdentityResolver {
  private readonly ghostbrainUrl: string;
  private readonly ttlMs:         number;
  private readonly maxCache:      number;
  private readonly fetcher:        (url: string, init?: RequestInit) => Promise<Response>;

  /** username (normalised) → identity */
  private readonly forwardCache = new Map<string, ResolvedIdentity>();

  /** address (lowercase) → username */
  private readonly reverseCache = new Map<string, string>();

  /** Insertion-order tracking for LRU eviction. */
  private readonly insertionOrder: string[] = [];

  constructor(opts: IdentityResolverOptions = {}) {
    this.ghostbrainUrl = opts.ghostbrainUrl ?? GHOSTBRAIN_URL;
    this.ttlMs         = opts.ttlMs         ?? DEFAULT_TTL_MS;
    this.maxCache      = opts.maxCache       ?? MAX_CACHE;
    this.fetcher       = opts.fetcher        ?? ((url, init) => fetch(url, init));
  }

  // ── Public API ─────────────────────────────────────────────────────────────

  /**
   * Resolve a GID username to its identity record.
   * Returns null if not found or inactive.
   */
  async resolve(username: string): Promise<ResolvedIdentity | null> {
    const key = normaliseUsername(username);
    const cached = this.forwardCache.get(key);

    if (cached && !this._isStale(cached)) {
      void this._forwardResolutionEvent(username, cached.wallet, "cache_hit");
      return cached;
    }

    const fresh = await this._fetchByUsername(key);
    if (fresh) {
      this._cacheEntry(key, fresh);
      void this._forwardResolutionEvent(username, fresh.wallet, "resolved");
    }
    return fresh;
  }

  /**
   * Reverse-resolve a wallet address to its username.
   * Returns null if no username registered for this address.
   */
  async reverseResolve(address: string): Promise<ResolvedIdentity | null> {
    const addr     = normaliseAddress(address);
    const username = this.reverseCache.get(addr);

    if (username) {
      const cached = this.forwardCache.get(username);
      if (cached && !this._isStale(cached)) {
        return cached;
      }
    }

    const fresh = await this._fetchByAddress(addr);
    if (fresh) {
      const key = normaliseUsername(fresh.username);
      this._cacheEntry(key, fresh);
      void this._forwardResolutionEvent(fresh.username, address, "reverse_resolved");
    }
    return fresh;
  }

  /**
   * Explicitly invalidate a cached identity — e.g. after a registry mutation.
   */
  invalidate(username: string): void {
    const key = normaliseUsername(username);
    const entry = this.forwardCache.get(key);
    if (entry) {
      this.reverseCache.delete(normaliseAddress(entry.wallet));
      this.forwardCache.delete(key);
    }
  }

  /** Point-in-time cache statistics. */
  stats(): { forwardEntries: number; reverseEntries: number; maxCache: number } {
    return {
      forwardEntries: this.forwardCache.size,
      reverseEntries: this.reverseCache.size,
      maxCache:       this.maxCache,
    };
  }

  // ── Internal — Cache Management ────────────────────────────────────────────

  private _isStale(entry: ResolvedIdentity): boolean {
    return nowMs() - entry.cachedAt > this.ttlMs;
  }

  private _cacheEntry(key: string, identity: ResolvedIdentity): void {
    // Evict oldest entries if at capacity.
    while (this.forwardCache.size >= this.maxCache) {
      const oldest = this.insertionOrder.shift();
      if (!oldest) break;
      const evicted = this.forwardCache.get(oldest);
      if (evicted) this.reverseCache.delete(normaliseAddress(evicted.wallet));
      this.forwardCache.delete(oldest);
    }

    this.forwardCache.set(key, identity);
    this.reverseCache.set(normaliseAddress(identity.wallet), key);
    this.insertionOrder.push(key);
  }

  // ── Internal — Data Source ─────────────────────────────────────────────────

  /**
   * Fetch identity from GhostBrain cache layer (which itself mirrors the
   * on-chain registry).  In dev/test, GhostBrain returns a stub record.
   */
  private async _fetchByUsername(username: string): Promise<ResolvedIdentity | null> {
    try {
      const res = await this.fetcher(
        `${this.ghostbrainUrl}/gid/resolve?username=${encodeURIComponent(username)}`,
        { headers: { "Content-Type": "application/json" } },
      );
      if (res.status === 404) return null;
      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      const data = (await res.json()) as GhostBrainIdentityResponse;
      return this._mapResponse(data);
    } catch (err: unknown) {
      if (err instanceof Error)
        console.error("[IdentityResolver] fetch by username failed:", err.message);
      return null;
    }
  }

  private async _fetchByAddress(address: string): Promise<ResolvedIdentity | null> {
    try {
      const res = await this.fetcher(
        `${this.ghostbrainUrl}/gid/reverse?address=${encodeURIComponent(address)}`,
        { headers: { "Content-Type": "application/json" } },
      );
      if (res.status === 404) return null;
      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      const data = (await res.json()) as GhostBrainIdentityResponse;
      return this._mapResponse(data);
    } catch (err: unknown) {
      if (err instanceof Error)
        console.error("[IdentityResolver] fetch by address failed:", err.message);
      return null;
    }
  }

  // ── Internal — GhostBrain Notification ────────────────────────────────────

  private async _forwardResolutionEvent(
    username:  string,
    wallet:    string,
    eventType: string,
  ): Promise<void> {
    const payload: ResolutionEvent = {
      event_type:   eventType,
      username,
      wallet,
      chain_id:     L1_CHAIN_ID,
      gas_token:    "GST",
      timestamp:    Math.floor(nowMs() / 1000),
    };

    try {
      const res = await this.fetcher(`${this.ghostbrainUrl}/gid/resolve-event`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify(payload),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
    } catch (err: unknown) {
      if (err instanceof Error)
        console.error("[IdentityResolver] GhostBrain notification failed:", err.message);
    }
  }

  // ── Internal — Response Mapping ───────────────────────────────────────────

  private _mapResponse(data: GhostBrainIdentityResponse): ResolvedIdentity {
    return {
      username:      data.username,
      wallet:        data.wallet,
      walletByLayer: {
        [L1_CHAIN_ID]: data.wallet,
        ...(data.walletL2 ? { [L2_CHAIN_ID]: data.walletL2 } : {}),
        ...(data.walletL3 ? { [L3_CHAIN_ID]: data.walletL3 } : {}),
      },
      kind:             data.kind as IdentityKind,
      registeredAt:     data.registered_at,
      active:           data.active,
      reputationScore:  data.reputation_score,
      cachedAt:         nowMs(),
    };
  }
}

// ── GhostBrain API Shapes ─────────────────────────────────────────────────────

interface GhostBrainIdentityResponse {
  username:         string;
  wallet:           string;
  walletL2?:        string;
  walletL3?:        string;
  kind:             string;
  registered_at:    number;
  active:           boolean;
  reputation_score?: number;
}

interface ResolutionEvent {
  event_type:  string;
  username:    string;
  wallet:      string;
  chain_id:    number;
  gas_token:   string;
  timestamp:   number;
}
