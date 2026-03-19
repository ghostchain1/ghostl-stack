/**
 * GhostNetworkDetector
 *
 * Auto-detect which GhostStack layer an RPC endpoint belongs to
 * by querying its chainId and comparing against known network configs.
 *
 * Also useful for detecting non-GhostStack networks (GhostChain mainnet,
 * testnets, etc.) when building multi-chain tooling.
 *
 * Usage:
 *   const detector = new GhostNetworkDetector();
 *   const result = await detector.detect("http://localhost:29547");
 *   // { chainId: 901, layer: "L2", isGhostNetwork: true, name: "GhostL2" }
 */

import { GhostNetworks } from "../networks.js";
import type { GhostLayer } from "../networks.js";

// ── Types ──────────────────────────────────────────────────────────────────────

export interface DetectionResult {
  /** Detected chain ID */
  chainId:        number;
  /** Ghost layer if recognised, null otherwise */
  layer:          GhostLayer | null;
  /** True if this chainId is a known GhostStack network */
  isGhostNetwork: boolean;
  /** Human-readable name (e.g. "GhostL2", "GhostChain Mainnet") */
  name:           string;
  /** RPC URL that was queried */
  rpcUrl:         string;
  /** How long the detection took in ms */
  latencyMs:      number;
}

export interface GhostNetworkDetectorConfig {
  /** Timeout per RPC call in ms. Default: 5000 */
  timeoutMs?: number;
}

// ── Known external chains ──────────────────────────────────────────────────────

const KNOWN_CHAINS: Record<number, string> = {
  1:        "GhostChain Mainnet",
  11155111: "Sepolia Testnet",
  10:       "Optimism L2" /* external network — name is canonical */,
  42161:    "Arbitrum One",
  137:      "Polygon",
  8453:     "Base",
  56:       "BNB Smart Chain",
  43114:    "Avalanche C-Chain",
};

// ── GhostNetworkDetector ───────────────────────────────────────────────────────

export class GhostNetworkDetector {
  private readonly timeoutMs: number;

  /** Pre-built map of chainId → GhostLayer for fast lookup */
  private readonly _ghostChains: Map<number, { layer: GhostLayer; name: string }>;

  constructor(config: GhostNetworkDetectorConfig = {}) {
    this.timeoutMs    = config.timeoutMs ?? 5_000;
    this._ghostChains = new Map();

    for (const [layer, cfg] of Object.entries(GhostNetworks) as [GhostLayer, typeof GhostNetworks[GhostLayer]][]) {
      this._ghostChains.set(cfg.chainId, { layer, name: cfg.name });
    }
  }

  /**
   * Detect network from an RPC endpoint.
   * Returns null if the endpoint is unreachable.
   */
  async detect(rpcUrl: string): Promise<DetectionResult | null> {
    const start = Date.now();
    try {
      const chainIdHex = await this._rpc(rpcUrl, "ghost_chainId", []);
      if (typeof chainIdHex !== "string") return null;

      const chainId   = Number(BigInt(chainIdHex));
      const latencyMs = Date.now() - start;

      const ghost = this._ghostChains.get(chainId);
      if (ghost) {
        return { chainId, layer: ghost.layer, isGhostNetwork: true, name: ghost.name, rpcUrl, latencyMs };
      }

      const known = KNOWN_CHAINS[chainId];
      return {
        chainId,
        layer:          null,
        isGhostNetwork: false,
        name:           known ?? `Unknown Chain (${chainId})`,
        rpcUrl,
        latencyMs,
      };
    } catch {
      return null;
    }
  }

  /**
   * Detect multiple RPC endpoints in parallel.
   * Null entries indicate unreachable endpoints.
   */
  async detectAll(rpcUrls: string[]): Promise<Array<DetectionResult | null>> {
    return Promise.all(rpcUrls.map((url) => this.detect(url)));
  }

  /**
   * Given an unknown RPC URL, determine which Ghost layer it is (if any).
   */
  async layerOf(rpcUrl: string): Promise<GhostLayer | null> {
    const result = await this.detect(rpcUrl);
    return result?.layer ?? null;
  }

  // ── Internal ───────────────────────────────────────────────────────────────

  private async _rpc(url: string, method: string, params: unknown[]): Promise<unknown> {
    const ctrl = new AbortController();
    const t    = setTimeout(() => ctrl.abort(), this.timeoutMs);
    try {
      const res  = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
        signal: ctrl.signal,
      });
      const json = await res.json() as { result?: unknown };
      return json.result;
    } finally {
      clearTimeout(t);
    }
  }
}

/** Default singleton instance */
export const ghostNetworkDetector = new GhostNetworkDetector();
