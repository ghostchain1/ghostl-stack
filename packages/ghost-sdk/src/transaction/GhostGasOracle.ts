/**
 * GhostGasOracle
 *
 * Multi-source gas price oracle for GhostStack.
 *
 * Priority order:
 *   1. AI optimizer (GhostAIGasOptimizer) — uses block history heuristics
 *   2. RPC `eth_feeHistory` — on-chain truth
 *   3. RPC `eth_gasPrice` — legacy fallback
 *   4. Hardcoded minimum — offline last-resort
 *
 * Usage:
 *   const oracle = new GhostGasOracle({ layer: "L2" });
 *   const fees = await oracle.suggest();
 *   // { maxFeePerGas, maxPriorityFeePerGas }
 */

import type { GhostLayer } from "../networks.js";
import { GhostNetworks } from "../networks.js";
import type { GhostFeeSuggestion } from "../native/types.js";
import { GhostAIGasOptimizer, NetworkStats } from "../ai/GhostAIGasOptimizer.js";

// ── Config ────────────────────────────────────────────────────────────────────

export interface GhostGasOracleConfig {
  layer:         GhostLayer;
  rpc?:          string;
  /** Weight given to RPC data vs AI model (0‥1). Default: 0.5 */
  rpcWeight?:    number;
  /** Override urgency: "low" | "normal" | "high". Default: "normal" */
  urgency?:       "slow" | "standard" | "fast";
  /** Timeout for RPC calls in ms. Default: 5000 */
  timeoutMs?:    number;
}

// ── GhostGasOracle ────────────────────────────────────────────────────────────

export class GhostGasOracle {
  private readonly layer:     GhostLayer;
  private readonly rpcUrl:    string;
  private readonly timeoutMs: number;
  private readonly urgency:   "slow" | "standard" | "fast";
  private readonly rpcWeight: number;
  private readonly ai:        GhostAIGasOptimizer;

  constructor(config: GhostGasOracleConfig) {
    this.layer     = config.layer;
    this.rpcUrl    = config.rpc      ?? GhostNetworks[config.layer].rpc;
    this.timeoutMs = config.timeoutMs ?? 5_000;
    this.urgency   = config.urgency   ?? "standard";
    this.rpcWeight = config.rpcWeight ?? 0.5;
    this.ai        = new GhostAIGasOptimizer({ targetSpeed: this.urgency });
  }

  /**
   * Return the best fee suggestion for the target layer.
   */
  async suggest(): Promise<GhostFeeSuggestion> {
    try {
      const stats = await this._fetchStats();
      this.ai.recordBlock({
        baseGas:     stats.baseGas,
        mempoolSize: stats.mempoolSize,
      });
      const networkStats: NetworkStats = { baseGas: stats.baseGas, mempoolSize: stats.mempoolSize };
      const aiSuggestion = this.ai.suggest(networkStats);

      // Blend AI suggestion with raw RPC data
      const blended = _blend(
        { maxFeePerGas: stats.baseGas * 2n, maxPriorityFeePerGas: stats.baseGas / 10n },
        aiSuggestion,
        this.rpcWeight,
      );
      return blended;
    } catch {
      // Offline fallback
      return this._fallback();
    }
  }

  /** Return current base fee from the chain (raw). */
  async baseFee(): Promise<bigint> {
    try {
      const stats = await this._fetchStats();
      return stats.baseGas;
    } catch {
      return 1_000_000_000n; // 1 gwei fallback
    }
  }

  // ── Internal ──────────────────────────────────────────────────────────────

  private async _fetchStats(): Promise<{ baseGas: bigint; mempoolSize: number }> {
    const [blockRes, gasPriceRes] = await Promise.allSettled([
      this._rpc("eth_getBlockByNumber", ["latest", false]),
      this._rpc("eth_gasPrice", []),
    ]);

    const block = blockRes.status === "fulfilled"
      ? blockRes.value as Record<string, string>
      : null;

    const gasPrice = gasPriceRes.status === "fulfilled"
      ? BigInt(gasPriceRes.value as string)
      : 1_000_000_000n;

    const baseGas = block?.["baseFeePerGas"] ? BigInt(block["baseFeePerGas"]) : gasPrice;

    return { baseGas, mempoolSize: 0 };
  }

  private _fallback(): GhostFeeSuggestion {
    const base: Record<GhostLayer, bigint> = {
      L1: 20_000_000_000n, // 20 gwei
      L2: 1_000_000_000n,  // 1 gwei
      L3: 100_000_000n,    // 0.1 gwei
    };
    const b = base[this.layer];
    return { maxFeePerGas: b * 2n, maxPriorityFeePerGas: b / 10n };
  }

  private async _rpc(method: string, params: unknown[]): Promise<unknown> {
    const ctrl = new AbortController();
    const t    = setTimeout(() => ctrl.abort(), this.timeoutMs);
    try {
      const res = await fetch(this.rpcUrl, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
        signal: ctrl.signal,
      });
      const json = await res.json() as { result?: unknown; error?: unknown };
      if (json.error) throw new Error(JSON.stringify(json.error));
      return json.result;
    } finally {
      clearTimeout(t);
    }
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function _blend(
  rpc: GhostFeeSuggestion,
  ai: GhostFeeSuggestion,
  rpcWeight: number,
): GhostFeeSuggestion {
  const aiW = 1 - rpcWeight;
  const blend = (a: bigint, b: bigint) =>
    BigInt(Math.round(Number(a) * rpcWeight + Number(b) * aiW));
  return {
    maxFeePerGas:         blend(rpc.maxFeePerGas,         ai.maxFeePerGas),
    maxPriorityFeePerGas: blend(rpc.maxPriorityFeePerGas, ai.maxPriorityFeePerGas),
  };
}
