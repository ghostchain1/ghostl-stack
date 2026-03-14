/**
 * AutonomousGhostProvider — single entry point for all RPC operations.
 *
 * Responsibilities
 * ─────────────────
 *  1. GhostStack routing law: L3 → L2 → L1 only; L1 → external only
 *  2. AI-assisted endpoint selection (latency, error-rate, head-health)
 *  3. Circuit-breaker enforcement via RpcPool
 *  4. Quorum reads (median across N healthy endpoints)
 */

import type { JsonRpcProvider } from "ethers";
import { GhostRoutingError, GhostRpcUnavailableError, GhostQuorumError } from "../errors.js";
import { HeuristicAiEngine } from "./ai-engine.js";
import type { GhostAiEngine, RouteIntent } from "./ai-engine.js";
import { RpcPool } from "./rpc-pool.js";
import type { RpcHealth } from "./ai-engine.js";

// ── Config ─────────────────────────────────────────────────────────────────────

export interface AutonomousConfig {
  /** RPC endpoint URLs for each GhostStack layer. */
  l1: string[];
  l2: string[];
  l3: string[];
  /**
   * External RPC endpoints (e.g. Mainnet GhostChain / GhostRPC).
   * Only reachable via `external()` and only when `allowExternalOnL1=true`.
   */
  externals?: string[];
  /**
   * Must be explicitly set to `true` to call `.external()`.
   * Reflects the GhostStack law: only L1 may talk to the outside world.
   */
  allowExternalOnL1?: boolean;
  /** Override the AI engine; defaults to HeuristicAiEngine. */
  aiEngine?: GhostAiEngine;
  /**
   * Health-probe interval in milliseconds.
   * Set to 0 to disable background probing (useful in tests).
   */
  probeIntervalMs?: number;
}

// ── Main class ─────────────────────────────────────────────────────────────────

export class AutonomousGhostProvider {
  private readonly pool: RpcPool;
  private readonly ai:   GhostAiEngine;
  private readonly cfg:  AutonomousConfig;

  constructor(cfg: AutonomousConfig) {
    this.cfg = cfg;
    this.ai  = cfg.aiEngine ?? new HeuristicAiEngine();

    const allUrls: Array<{ url: string; layer: RpcHealth["layer"] }> = [
      ...cfg.l1.map(url => ({ url, layer: "L1" as const })),
      ...cfg.l2.map(url => ({ url, layer: "L2" as const })),
      ...cfg.l3.map(url => ({ url, layer: "L3" as const })),
      ...(cfg.externals ?? []).map(url => ({ url, layer: "EXTERNAL" as const })),
    ];

    this.pool = new RpcPool(allUrls);

    const period = cfg.probeIntervalMs ?? 5_000;
    if (period > 0) this.pool.startHealthLoop(period);
  }

  /** Gracefully stop background probing. Call when shutting down the service. */
  destroy(): void {
    this.pool.stopHealthLoop();
  }

  // ── Primary surfaces ────────────────────────────────────────────────────────

  /**
   * Obtain a provider for the given layer.
   *
   * @param layer  Target layer ("L1" | "L2" | "L3").
   * @param mode   "READ" (fastest) or "WRITE" (safest / most reliable).
   */
  providerFor(layer: "L1" | "L2" | "L3", mode: "READ" | "WRITE" = "READ"): JsonRpcProvider {
    const intent: RouteIntent = { kind: mode, layer };
    this._enforce(intent);
    const candidates = this.pool.list(layer);
    const decision   = this.ai.decide(intent, candidates);
    return this.pool.getProvider(decision.chosenUrl);
  }

  /**
   * Routing-aware upstream bridge.
   * L3 → L2, L2 → L1.  Direct L3 → L1 is forbidden by GhostStack law.
   */
  upstreamFrom(from: "L3" | "L2"): JsonRpcProvider {
    const intent: RouteIntent = { kind: "UPSTREAM", from };
    this._enforce(intent);
    const targetLayer: "L1" | "L2" = from === "L3" ? "L2" : "L1";
    const candidates = this.pool.list(targetLayer);
    const decision   = this.ai.decide({ kind: "READ", layer: targetLayer }, candidates);
    return this.pool.getProvider(decision.chosenUrl);
  }

  /**
   * Access an external (non-GhostStack) network.
   * Only permitted when `allowExternalOnL1 = true` in config.
   */
  external(name?: string): JsonRpcProvider {
    const intent: RouteIntent = { kind: "EXTERNAL", from: "L1", name };
    this._enforce(intent);
    if (!this.cfg.externals || this.cfg.externals.length === 0) {
      throw new GhostRpcUnavailableError("No external endpoints configured.");
    }
    const candidates = this.pool.list("EXTERNAL");
    const decision   = this.ai.decide(intent, candidates);
    return this.pool.getProvider(decision.chosenUrl);
  }

  /**
   * Quorum read — asks `quorum` healthy endpoints and returns the median
   * block number.  Throws `GhostQuorumError` if fewer than `quorum`
   * endpoints respond successfully.
   *
   * @param layer  Target layer to query.
   * @param quorum Minimum number of matching (±1 block) responses required.
   */
  async quorumBlockNumber(layer: "L1" | "L2" | "L3", quorum = 2): Promise<number> {
    const candidates = this.pool.list(layer).filter(h => !h.circuitOpen);

    if (candidates.length < quorum) {
      throw new GhostQuorumError(
        `Quorum ${quorum} requires at least ${quorum} open endpoints on ${layer}, ` +
        `but only ${candidates.length} available.`
      );
    }

    const results = await Promise.allSettled(
      candidates.map(async h => {
        const provider = this.pool.getProvider(h.url);
        return provider.getBlockNumber();
      })
    );

    const nums = results
      .filter((r): r is PromiseFulfilledResult<number> => r.status === "fulfilled")
      .map(r => r.value)
      .sort((a, b) => a - b);

    if (nums.length < quorum) {
      throw new GhostQuorumError(
        `Quorum ${quorum} not reached on ${layer}: got ${nums.length} responses.`
      );
    }

    // Median
    const mid = Math.floor(nums.length / 2);
    return nums.length % 2 === 1
      ? nums[mid]
      : Math.round((nums[mid - 1] + nums[mid]) / 2);
  }

  // ── GhostStack law enforcement ──────────────────────────────────────────────

  private _enforce(intent: RouteIntent): void {
    if (intent.kind === "EXTERNAL" && !this.cfg.allowExternalOnL1) {
      throw new GhostRoutingError(
        "External RPC access is disabled. Set allowExternalOnL1=true in AutonomousConfig."
      );
    }
    // Reserved: additional policy checks (e.g. L3→L1 short-circuit detection)
    // can be added here when the GhostBrain integration lands.
  }
}
