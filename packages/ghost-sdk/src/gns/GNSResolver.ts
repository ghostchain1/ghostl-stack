/**
 * GNSResolver — Ghost Name Service resolver
 *
 * Resolves human-readable `.ghost` names to on-chain addresses.
 * Resolution order:
 *   1. In-memory cache (instant)
 *   2. GNS API endpoint (REST, ghost-dns service)
 *   3. On-chain GNSRegistry contract (direct RPC call)
 *
 * Usage:
 *   const gns = new GNSResolver();
 *
 *   // Register local dev names
 *   gns.register("treasury.ghost", "0xDeadBeef...");
 *
 *   // Resolve — checks cache then API then on-chain
 *   const addr = await gns.resolve("treasury.ghost");
 *
 *   // Reverse lookup (local only)
 *   const name = gns.reverseLookup("0xDeadBeef...");
 */

import { GNSCache } from "./GNSCache.js";

// ── Constants ─────────────────────────────────────────────────────────────────

/** Default GNS API (ghost-dns service). Override via GNS_API env var. */
const DEFAULT_GNS_API =
  (typeof process !== "undefined" && process.env["GNS_API"]) ||
  "https://gns-api.ghostchain.cloud";

/** eth_call selector for `resolve(bytes32)` */
const RESOLVE_SELECTOR = "0x0178b8bf";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface GNSResolverConfig {
  /**
   * REST endpoint of the ghost-dns / GNS-API service.
   * Default: https://gns-api.ghostchain.cloud
   */
  apiEndpoint?: string;
  /**
   * On-chain GNSRegistry contract address.
   * If provided, on-chain resolution is attempted as final fallback.
   */
  registryAddress?: string;
  /**
   * JSON-RPC endpoint to use for on-chain resolution.
   * Required when `registryAddress` is set.
   */
  rpcUrl?: string;
  /** Cache configuration. Pass `false` to disable caching. */
  cache?: import("./GNSCache.js").GNSCacheConfig | false;
}

// ── GNS namehash (EIP-137 compatible, .ghost TLD) ────────────────────────────

function keccak256Bytes(data: Uint8Array): Uint8Array {
  // Inline keccak from @noble/hashes to avoid circular dep on SDK keccak module.
  // Callers with @noble/hashes installed will use this path automatically.
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { keccak_256 } = require("@noble/hashes/sha3") as { keccak_256: (d: Uint8Array) => Uint8Array };
    return keccak_256(data);
  } catch {
    throw new Error("GNSResolver: @noble/hashes is required for namehash computation");
  }
}

export function gnsNamehash(name: string): string {
  const enc = new TextEncoder();
  let node = new Uint8Array(32);

  if (name === "") {
    return "0x" + Array.from(node).map(b => b.toString(16).padStart(2, "0")).join("");
  }

  const labels = name.split(".").reverse();
  for (const label of labels) {
    const labelHash = keccak256Bytes(enc.encode(label));
    const combined  = new Uint8Array(64);
    combined.set(node,      0);
    combined.set(labelHash, 32);
    node = keccak256Bytes(combined);
  }

  return "0x" + Array.from(node).map(b => b.toString(16).padStart(2, "0")).join("");
}

// ── GNSResolver ───────────────────────────────────────────────────────────────

export class GNSResolver {
  private readonly cache:           GNSCache | null;
  private readonly apiEndpoint:     string;
  private readonly registryAddress: string | null;
  private readonly rpcUrl:          string | null;
  private readonly _local:          Map<string, string> = new Map();

  constructor(config: GNSResolverConfig = {}) {
    this.apiEndpoint     = config.apiEndpoint     ?? DEFAULT_GNS_API;
    this.registryAddress = config.registryAddress ?? null;
    this.rpcUrl          = config.rpcUrl          ?? null;
    this.cache           = config.cache === false
      ? null
      : new GNSCache(config.cache ?? { defaultTtlMs: 300_000 });
  }

  // ── Local registry ────────────────────────────────────────────────────────

  /** Pre-register a name (dev / testing). */
  register(name: string, address: string): void {
    const key = name.toLowerCase();
    this._local.set(key, address);
    this.cache?.set(key, address, 0); // 0 = never expire for local entries
  }

  /** Unregister a local name. */
  unregister(name: string): void {
    const key = name.toLowerCase();
    this._local.delete(key);
    this.cache?.delete(key);
  }

  // ── Resolution ────────────────────────────────────────────────────────────

  /**
   * Resolve a `.ghost` name to an address.
   * Returns `null` if unresolvable.
   */
  async resolve(name: string): Promise<string | null> {
    const key = name.toLowerCase();

    // 1. Check local registry (highest priority)
    const local = this._local.get(key);
    if (local) return local;

    // 2. Check cache
    const cached = this.cache?.get(key);
    if (cached) return cached;

    // 3. REST API
    const fromApi = await this._resolveViaApi(key);
    if (fromApi) {
      this.cache?.set(key, fromApi);
      return fromApi;
    }

    // 4. On-chain registry
    if (this.registryAddress && this.rpcUrl) {
      const fromChain = await this._resolveOnChain(key);
      if (fromChain) {
        this.cache?.set(key, fromChain);
        return fromChain;
      }
    }

    return null;
  }

  /** Resolve or throw. */
  async mustResolve(name: string): Promise<string> {
    const addr = await this.resolve(name);
    if (!addr) throw new Error(`GNS: cannot resolve "${name}"`);
    return addr;
  }

  /** Reverse lookup (local + cache only). */
  reverseLookup(address: string): string | null {
    const lower = address.toLowerCase();
    for (const [name, addr] of this._local) {
      if (addr.toLowerCase() === lower) return name;
    }
    return null;
  }

  /** Compute the GNS namehash for a name (EIP-137 compatible). */
  static namehash(name: string): string {
    return gnsNamehash(name);
  }

  // ── Internal ──────────────────────────────────────────────────────────────

  private async _resolveViaApi(name: string): Promise<string | null> {
    try {
      const url = `${this.apiEndpoint}/resolve/${encodeURIComponent(name)}`;
      const res = await fetch(url, {
        signal: AbortSignal.timeout?.(5_000) ?? undefined,
      });
      if (!res.ok) return null;
      const json = await res.json() as { address?: string };
      return json.address ?? null;
    } catch {
      return null;
    }
  }

  private async _resolveOnChain(name: string): Promise<string | null> {
    if (!this.registryAddress || !this.rpcUrl) return null;

    try {
      const nameHash = gnsNamehash(name);
      const param    = nameHash.slice(2).padStart(64, "0");
      const data     = RESOLVE_SELECTOR + param;

      const body = JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "eth_call",
        params: [{ to: this.registryAddress, data }, "latest"],
      });

      const res = await fetch(this.rpcUrl, {
        method:  "POST",
        headers: { "content-type": "application/json" },
        body,
        signal: AbortSignal.timeout?.(8_000) ?? undefined,
      });

      const json = await res.json() as { result?: string };
      const result = json.result;
      if (!result || result === "0x" || /^0x0+$/.test(result)) return null;
      const addrHex = "0x" + result.slice(-40);
      if (/^0x0{40}$/.test(addrHex)) return null;
      return addrHex;
    } catch {
      return null;
    }
  }
}

/** Default singleton resolver. */
export const gnsResolver = new GNSResolver();
