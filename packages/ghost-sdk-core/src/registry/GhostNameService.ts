/**
 * GhostNameService (GNS) — Ghost-native naming system
 *
 * GNS resolves human-readable `.ghost` names to on-chain addresses.
 * Works in two modes:
 *   1. On-chain mode — calls a GNSRegistry contract deployed on GhostChain
 *   2. In-memory mode — a local / hardcoded registry for development
 *
 * Usage:
 *   const gns = GhostNameService.forL1();
 *
 *   // Development registry
 *   gns.register("treasury.ghost", "0xAbCd...");
 *   await gns.resolve("treasury.ghost"); // → "0xAbCd..."
 *
 *   // On-chain resolver (requires GNSRegistry deployment)
 *   const gnsOnChain = new GhostNameService(rpcUrl, registryAddress);
 *   await gnsOnChain.resolve("wallet.ghost");
 */

import { GhostRPC } from "../rpc/GhostRPC";
import { GhostNetworkRegistry, ChainLayer } from "./GhostNetworkRegistry";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface GhostNameRecord {
  name:    string;   // e.g. "treasury.ghost"
  address: string;   // EIP-55 checksummed address
  ttl:     number;   // Unix timestamp after which record is stale (0 = never)
  owner:   string;   // Who controls this record
}

// ── Minimal ABI fragment for on-chain GNSRegistry ────────────────────────────

/**
 * Expected ABI of the on-chain GNSRegistry contract:
 *   function resolve(bytes32 nameHash) external view returns (address)
 *   function owner(bytes32 nameHash)   external view returns (address)
 *   function ttl(bytes32 nameHash)     external view returns (uint64)
 *
 * We encode calls manually so the SDK stays ABI-codec free at this layer.
 */
const RESOLVE_SELECTOR = "0x0178b8bf"; // keccak256("resolve(bytes32)")[0:4]
const OWNER_SELECTOR   = "0x02571be3"; // keccak256("owner(bytes32)")[0:4]
const TTL_SELECTOR     = "0x16a25cbd"; // keccak256("ttl(bytes32)")[0:4]

// ── Hashing ──────────────────────────────────────────────────────────────────

/**
 * GNS namehash — mirrors GNS namehash algorithm (EIP-137) but under the
 * `.ghost` TLD.  This makes GNS structurally compatible with GNS tooling.
 *
 * namehash("")             = 0x0000...0000
 * namehash("ghost")        = keccak256(namehash("") + keccak256("ghost"))
 * namehash("foo.ghost")    = keccak256(namehash("ghost") + keccak256("foo"))
 */
export function gnsNamehash(name: string): string {
  // Dynamic import of keccak from SDK to avoid circular dependency issues
  const { keccak256 } = require("../crypto/keccak") as { keccak256: (data: Uint8Array) => Uint8Array };

  const enc = new TextEncoder();
  let node = new Uint8Array(32); // starts as 32 zero bytes

  if (name === "") return "0x" + Buffer.from(node).toString("hex");

  const labels = name.split(".").reverse();
  for (const label of labels) {
    const labelHash = keccak256(enc.encode(label));
    const combined  = new Uint8Array(64);
    combined.set(node,      0);
    combined.set(labelHash, 32);
    node = keccak256(combined) as Uint8Array<ArrayBuffer>;
  }

  return "0x" + Buffer.from(node).toString("hex");
}

// ── GhostNameService ──────────────────────────────────────────────────────────

export class GhostNameService {
  private rpc:             GhostRPC;
  private registryAddress: string | null;
  private _local:          Map<string, GhostNameRecord> = new Map();

  /**
   * @param rpcUrl          JSON-RPC endpoint to query for on-chain lookups.
   * @param registryAddress Optional: deployed GNSRegistry contract address.
   *                        If omitted, only the in-memory registry is used.
   */
  constructor(rpcUrl: string, registryAddress?: string) {
    this.rpc             = new GhostRPC(rpcUrl);
    this.registryAddress = registryAddress ?? null;
  }

  // ── Factories ─────────────────────────────────────────────────────────────

  static forL1(registryAddress?: string): GhostNameService {
    return new GhostNameService(
      GhostNetworkRegistry.get(ChainLayer.L1).rpcUrl,
      registryAddress
    );
  }

  static forL2(registryAddress?: string): GhostNameService {
    return new GhostNameService(
      GhostNetworkRegistry.get(ChainLayer.L2).rpcUrl,
      registryAddress
    );
  }

  static forL3(registryAddress?: string): GhostNameService {
    return new GhostNameService(
      GhostNetworkRegistry.get(ChainLayer.L3).rpcUrl,
      registryAddress
    );
  }

  // ── Local registry ────────────────────────────────────────────────────────

  /**
   * Register a name→address mapping in the local (in-process) registry.
   * Useful for development, testing, or pre-loading known addresses.
   */
  register(name: string, address: string, owner = address, ttl = 0): void {
    this._validateName(name);
    this._local.set(name.toLowerCase(), { name, address, ttl, owner });
  }

  /** Remove a name from the local registry. */
  unregister(name: string): void {
    this._local.delete(name.toLowerCase());
  }

  /** List all locally registered names. */
  localRecords(): GhostNameRecord[] {
    return Array.from(this._local.values());
  }

  // ── Resolution ────────────────────────────────────────────────────────────

  /**
   * Resolve a `.ghost` name to an address.
   *
   * Resolution order:
   *   1. Local in-memory registry (instant, no RPC)
   *   2. On-chain GNSRegistry (if registryAddress was provided)
   *
   * @returns The checksummed address, or `null` if not found.
   */
  async resolve(name: string): Promise<string | null> {
    const key = name.toLowerCase();

    // 1. Local lookup
    const local = this._local.get(key);
    if (local) {
      if (local.ttl === 0 || local.ttl > Math.floor(Date.now() / 1000)) {
        return local.address;
      }
      // TTL expired — remove from local cache
      this._local.delete(key);
    }

    // 2. On-chain lookup
    if (this.registryAddress) {
      return this._resolveOnChain(key);
    }

    return null;
  }

  /**
   * Resolve or throw.  Convenience wrapper around `resolve()`.
   */
  async mustResolve(name: string): Promise<string> {
    const addr = await this.resolve(name);
    if (!addr) throw new Error(`GNS: cannot resolve "${name}"`);
    return addr;
  }

  /**
   * Reverse-lookup: find the `.ghost` name for a given address.
   * Only searches the local registry (on-chain reverse lookup not yet implemented).
   */
  reverseLookup(address: string): string | null {
    const lower = address.toLowerCase();
    for (const rec of this._local.values()) {
      if (rec.address.toLowerCase() === lower) return rec.name;
    }
    return null;
  }

  // ── On-chain resolution ───────────────────────────────────────────────────

  private async _resolveOnChain(name: string): Promise<string | null> {
    if (!this.registryAddress) return null;

    const nameHash = gnsNamehash(name);
    // Pad nameHash to 32 bytes and build calldata
    const param = nameHash.slice(2).padStart(64, "0");

    try {
      const result = await this.rpc.ghost_call({
        to:   this.registryAddress,
        data: RESOLVE_SELECTOR + param,
      });

      if (!result || result === "0x" || result === "0x" + "0".repeat(64)) {
        return null;
      }

      // result is ABI-encoded address (32 bytes, left-padded)
      const addrHex = "0x" + result.slice(-40);
      if (addrHex === "0x0000000000000000000000000000000000000000") return null;
      return addrHex;
    } catch {
      return null;
    }
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  private _validateName(name: string): void {
    if (!name.endsWith(".ghost") && name !== "ghost") {
      throw new Error(`GNS: name must end with ".ghost" (got: "${name}")`);
    }
  }

  /** Compute the GNS namehash for a given name. */
  static namehash(name: string): string {
    return gnsNamehash(name);
  }
}

// ── Convenience exports ───────────────────────────────────────────────────────

/** selectors exposed for on-chain registry callers */
export const GNS_SELECTORS = {
  resolve: RESOLVE_SELECTOR,
  owner:   OWNER_SELECTOR,
  ttl:     TTL_SELECTOR,
} as const;
