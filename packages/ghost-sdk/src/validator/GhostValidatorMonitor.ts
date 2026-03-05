/**
 * GhostValidatorMonitor
 *
 * Monitors GhostStack validator / sequencer node health across all layers.
 * Reports block production, peer count, sync status, and uptime.
 *
 * Usage:
 *   const monitor = new GhostValidatorMonitor();
 *   const health  = await monitor.checkValidator("http://localhost:18545");
 *   const allHealth = await monitor.checkAllLayers();
 */

import { GhostNetworks, type GhostLayer } from "../networks.js";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface ValidatorHealth {
  layer:       GhostLayer;
  rpcUrl:      string;
  block:       number | null;
  peers:       number | null;
  syncing:     boolean | null;
  /** Whether the node appears healthy */
  healthy:     boolean;
  /** Error message if unhealthy */
  error?:      string;
  checkedAt:   number;
}

export interface ValidatorMonitorConfig {
  /** Request timeout per check. Default: 5000ms */
  timeoutMs?: number;
}

// ── GhostValidatorMonitor ─────────────────────────────────────────────────────

export class GhostValidatorMonitor {
  private readonly timeoutMs: number;

  constructor(config: ValidatorMonitorConfig = {}) {
    this.timeoutMs = config.timeoutMs ?? 5_000;
  }

  /**
   * Check a single validator / node endpoint.
   */
  async checkValidator(rpcUrl: string, layer: GhostLayer = "L1"): Promise<ValidatorHealth> {
    const checkedAt = Date.now();

    try {
      const [block, peers, syncing] = await Promise.all([
        this._rpc<string>(rpcUrl, "eth_blockNumber"),
        this._rpc<string>(rpcUrl, "net_peerCount"),
        this._rpc<boolean | { startingBlock: string }>(rpcUrl, "eth_syncing"),
      ]);

      const blockNum   = block  ? parseInt(block,  16) : null;
      const peerCount  = peers  ? parseInt(peers,  16) : null;
      const isSyncing  = syncing === true ? true
                       : syncing === false ? false
                       : typeof syncing === "object" && syncing !== null;

      const healthy = blockNum !== null && peerCount !== null && !isSyncing;

      return { layer, rpcUrl, block: blockNum, peers: peerCount, syncing: isSyncing, healthy, checkedAt };
    } catch (err) {
      return {
        layer, rpcUrl,
        block: null, peers: null, syncing: null,
        healthy: false,
        error: err instanceof Error ? err.message : String(err),
        checkedAt,
      };
    }
  }

  /**
   * Check all three GhostStack layers concurrently.
   */
  async checkAllLayers(overrideUrls?: Partial<Record<GhostLayer, string>>): Promise<ValidatorHealth[]> {
    const layers: GhostLayer[] = ["L1", "L2", "L3"];
    return Promise.all(
      layers.map(layer => {
        const url = overrideUrls?.[layer] ?? GhostNetworks[layer].rpc;
        return this.checkValidator(url, layer);
      })
    );
  }

  /**
   * Check block production rate: returns blocks/minute for the last `lookback` seconds.
   */
  async blockRate(rpcUrl: string, lookbackSeconds = 60): Promise<number> {
    const [latestHex, earlyHex] = await Promise.all([
      this._rpc<string>(rpcUrl, "eth_blockNumber"),
      // We use `eth_getBlockByNumber` with a lookback offset
      Promise.resolve("0x0"),
    ]);

    const latest = parseInt(latestHex, 16);
    // Estimate by polling two block numbers separated by real time
    const start = Date.now();
    await new Promise(r => setTimeout(r, Math.min(lookbackSeconds * 1000, 5000)));
    const laterHex = await this._rpc<string>(rpcUrl, "eth_blockNumber");
    const later    = parseInt(laterHex, 16);
    const elapsed  = (Date.now() - start) / 1000; // seconds

    const blocksProduced = later - latest;
    return elapsed > 0 ? (blocksProduced / elapsed) * 60 : 0; // blocks/min
  }

  // ── Internal ──────────────────────────────────────────────────────────────

  private async _rpc<T>(url: string, method: string): Promise<T> {
    const controller = new AbortController();
    const timer      = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const res  = await fetch(url, {
        method:  "POST",
        headers: { "content-type": "application/json" },
        body:    JSON.stringify({ jsonrpc: "2.0", id: 1, method, params: [] }),
        signal:  controller.signal,
      });
      const json = await res.json() as { result: T };
      return json.result;
    } finally {
      clearTimeout(timer);
    }
  }
}
