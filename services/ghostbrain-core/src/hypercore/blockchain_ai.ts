/**
 * GhostBrain HyperCore — Blockchain AI
 *
 * Monitors GhostChain L1 (14000101), GhostL2 (901), GhostL3 (903) and
 * produces strategic assessments of chain health, validator fitness,
 * and cross-layer settlement integrity.
 *
 * Sources:
 *   ghostchain_ai        → per-layer RPC health (block number, gas, latency)
 *   validator_monitor    → signing rate, jailing, bonded set size
 *
 * Safety: strategies that touch validator-set parameters, gas limits, or
 * cross-layer settlement require governance ratification (requiresGovernance=true)
 * and are forwarded to the signing relay (:7910).
 *
 * Prometheus metrics:
 *   ghostbrain_hypercore_chain_optimize_cycles_total
 *   ghostbrain_hypercore_chain_strategies_total
 *   ghostbrain_hypercore_chain_critical_total
 */

import { randomUUID }        from "node:crypto";
import {
  getChainStatus,
  getChainHealth,
  type ChainLayer,
}                            from "../blockchain/ghostchain_ai.js";
import {
  getValidators,
  getJailedValidators,
  getLowSigningValidators,
}                            from "../validators/validator_monitor.js";
import { inc }               from "../observability/metrics_exporter.js";
import { log }               from "../observability/event_logger.js";

// ── Config ────────────────────────────────────────────────────────────────────

const LATENCY_WARN_MS = Number(process.env.HYPERCORE_LATENCY_WARN_MS        ?? "500");
const MIN_BONDED      = Number(process.env.HYPERCORE_MIN_BONDED_VALIDATORS   ?? "2");

// ── Types ─────────────────────────────────────────────────────────────────────

export type ChainStrategyAction =
  | "stable"
  | "increase_peers"
  | "throttle_gas"
  | "alert_validators"
  | "sync_l2"
  | "sync_l3"
  | "advisory";

export interface ChainStrategy {
  id:                 string;
  ts:                 number;
  layer:              ChainLayer | "validators" | "settlement";
  status:             "optimal" | "degraded" | "critical" | "offline";
  finding:            string;
  action:             ChainStrategyAction;
  rationale:          string;
  params:             Record<string, unknown>;
  requiresGovernance: boolean;
}

// ── State ─────────────────────────────────────────────────────────────────────

const _ring: ChainStrategy[] = [];
const MAX_RING               = 200;
let   _cycles                = 0;

function pushStrategy(s: ChainStrategy): void {
  _ring.push(s);
  if (_ring.length > MAX_RING) _ring.shift();
}

// ── Engine ────────────────────────────────────────────────────────────────────

export class BlockchainAI {

  /**
   * Evaluate current state of all GhostChain layers.
   * Returns a list of per-layer ChainStrategy records.
   */
  optimize(): ChainStrategy[] {
    _cycles++;
    inc("ghostbrain_hypercore_chain_optimize_cycles_total", "Total Blockchain AI optimization cycles");

    const strategies: ChainStrategy[] = [];

    try {
      const chainStatuses = getChainStatus();
      const chainHealth   = getChainHealth();

      // ── Per-layer chain health ────────────────────────────────────────────
      for (const status of chainStatuses) {
        if (!status.healthy) {
          const s: ChainStrategy = {
            id:                 randomUUID(),
            ts:                 Date.now(),
            layer:              status.layer,
            status:             "critical",
            finding:            `${status.layer.toUpperCase()} is unhealthy — latency=${status.latencyMs}ms peers=${status.peersOnline}`,
            action:             status.peersOnline ? "advisory" : "increase_peers",
            rationale:          `Chain ${status.layer} failed health check. blockNumber=${status.blockNumber} latency=${status.latencyMs}ms`,
            params:             { layer: status.layer, chainId: status.chainId, latencyMs: status.latencyMs },
            requiresGovernance: false,
          };
          strategies.push(s);
          pushStrategy(s);
          inc("ghostbrain_hypercore_chain_critical_total", "Critical Blockchain AI strategies");
        } else if (status.latencyMs > LATENCY_WARN_MS) {
          const s: ChainStrategy = {
            id:                 randomUUID(),
            ts:                 Date.now(),
            layer:              status.layer,
            status:             "degraded",
            finding:            `${status.layer.toUpperCase()} RPC latency elevated: ${status.latencyMs}ms`,
            action:             "advisory",
            rationale:          `Latency ${status.latencyMs}ms exceeds warn threshold ${LATENCY_WARN_MS}ms`,
            params:             { layer: status.layer, latencyMs: status.latencyMs, threshold: LATENCY_WARN_MS },
            requiresGovernance: false,
          };
          strategies.push(s);
          pushStrategy(s);
        } else {
          const s: ChainStrategy = {
            id:                 randomUUID(),
            ts:                 Date.now(),
            layer:              status.layer,
            status:             "optimal",
            finding:            `${status.layer.toUpperCase()} operating normally`,
            action:             "stable",
            rationale:          `block=${status.blockNumber} latency=${status.latencyMs}ms peers=${status.peersOnline}`,
            params:             { layer: status.layer, blockNumber: status.blockNumber },
            requiresGovernance: false,
          };
          strategies.push(s);
          pushStrategy(s);
        }
      }

      // ── Cross-layer settlement integrity ──────────────────────────────────
      const offline = (Object.entries(chainHealth) as [ChainLayer, boolean][])
        .filter(([, healthy]) => !healthy)
        .map(([l]) => l);

      if (offline.includes("l1") && !offline.includes("l2")) {
        // L2 is live but L1 is down — settlement chain broken
        const s: ChainStrategy = {
          id:                 randomUUID(),
          ts:                 Date.now(),
          layer:              "settlement",
          status:             "critical",
          finding:            "L2 is live but L1 is offline — settlement chain broken",
          action:             "sync_l2",
          rationale:          "L2 cannot settle to L1 while L1 is offline. Blocks will accumulate.",
          params:             { l1Offline: true, settlementBlocked: true },
          requiresGovernance: true,
        };
        strategies.push(s);
        pushStrategy(s);
        inc("ghostbrain_hypercore_chain_critical_total", "Critical Blockchain AI strategies");
      }

      if (offline.includes("l2") && !offline.includes("l3")) {
        // L3 is live but L2 is down — L3→L2 settlement broken
        const s: ChainStrategy = {
          id:                 randomUUID(),
          ts:                 Date.now(),
          layer:              "settlement",
          status:             "critical",
          finding:            "L3 is live but L2 is offline — L3→L2 settlement broken",
          action:             "sync_l3",
          rationale:          "L3 cannot batch-post to L2 while L2 is offline. L3 blocks queuing up.",
          params:             { l2Offline: true, settlementBlocked: true },
          requiresGovernance: true,
        };
        strategies.push(s);
        pushStrategy(s);
        inc("ghostbrain_hypercore_chain_critical_total", "Critical Blockchain AI strategies");
      }

      // ── Validator health ──────────────────────────────────────────────────
      const bonded  = getValidators().filter(v => v.status === "BOND_STATUS_BONDED");
      const jailed  = getJailedValidators();
      const lowSign = getLowSigningValidators();

      if (jailed.length > 0) {
        const s: ChainStrategy = {
          id:                 randomUUID(),
          ts:                 Date.now(),
          layer:              "validators",
          status:             "degraded",
          finding:            `${jailed.length} validator(s) jailed`,
          action:             "alert_validators",
          rationale:          `Jailed validators reduce consensus security. Monikers: ${jailed.map(v => v.moniker).join(", ")}`,
          params:             { jailedCount: jailed.length, monikers: jailed.map(v => v.moniker) },
          requiresGovernance: jailed.length > bonded.length * 0.3,
        };
        strategies.push(s);
        pushStrategy(s);
      }

      if (lowSign.length > 0) {
        const worst = lowSign.sort((a, b) => a.signingRate - b.signingRate)[0]!;
        const s: ChainStrategy = {
          id:                 randomUUID(),
          ts:                 Date.now(),
          layer:              "validators",
          status:             worst.signingRate < 0.80 ? "critical" : "degraded",
          finding:            `${lowSign.length} validator(s) with low signing rate (worst: ${worst.moniker} @ ${(worst.signingRate * 100).toFixed(1)}%)`,
          action:             "alert_validators",
          rationale:          "Low signing rate risks slashing. Peer sync or restart may recover.",
          params:             { worstMoniker: worst.moniker, signingRate: worst.signingRate, lowSignCount: lowSign.length },
          requiresGovernance: worst.signingRate < 0.80,
        };
        strategies.push(s);
        pushStrategy(s);
        if (worst.signingRate < 0.80) {
          inc("ghostbrain_hypercore_chain_critical_total", "Critical Blockchain AI strategies");
        }
      }

      if (bonded.length < MIN_BONDED) {
        const s: ChainStrategy = {
          id:                 randomUUID(),
          ts:                 Date.now(),
          layer:              "validators",
          status:             "critical",
          finding:            `Only ${bonded.length} bonded validator(s) — below minimum of ${MIN_BONDED}`,
          action:             "alert_validators",
          rationale:          "Chain consensus at risk with too few validators. Immediate governance action required.",
          params:             { bondedCount: bonded.length, minimum: MIN_BONDED },
          requiresGovernance: true,
        };
        strategies.push(s);
        pushStrategy(s);
        inc("ghostbrain_hypercore_chain_critical_total", "Critical Blockchain AI strategies");
      }

    } catch (err) {
      log.error("hypercore.blockchain_ai", `optimize error: ${String(err)}`);
    }

    inc("ghostbrain_hypercore_chain_strategies_total", "Total blockchain strategies generated", strategies.length);
    return strategies;
  }

  getStrategies(n = 50): ChainStrategy[] {
    return _ring.slice(-n);
  }

  stats() {
    return {
      optimizeCycles:  _cycles,
      strategiesStored: _ring.length,
      criticalCount:   _ring.filter(s => s.status === "critical").length,
      latestTs:        _ring.at(-1)?.ts ?? null,
    };
  }
}

export const blockchainAI = new BlockchainAI();
