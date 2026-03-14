/**
 * GhostBrain — Deployment Optimizer
 *
 * Analyses gas prices and block conditions across L1 / L2 / L3
 * and recommends the optimal window for contract deployments.
 * Integrates with the blockchain AI + memory system.
 */

import { getChainStatus } from "./ghostchain_ai.js";
import { store_event }    from "../memory_engine.js";
import { log }            from "../observability/event_logger.js";
import type { ChainLayer } from "./ghostchain_ai.js";

// ── Config ────────────────────────────────────────────────────────────────────

const GAS_LOW_THRESHOLD  = BigInt(process.env.DEPLOY_GAS_LOW_THRESHOLD  ?? "1000000000");  // 1 gwei in wei
const LATENCY_MAX_MS     = Number(process.env.DEPLOY_LATENCY_MAX_MS     ?? "3000");
const WINDOW_HISTORY_MAX = 100;

// ── Types ─────────────────────────────────────────────────────────────────────

export interface DeployWindow {
  layer:        ChainLayer;
  chainId:      number;
  gasPrice:     bigint;
  gasPriceGwei: number;
  latencyMs:    number;
  score:        number;  // 0–1 (higher = better window)
  recommended:  boolean;
  reason:       string;
  evaluatedAt:  number;
}

export interface DeployRecommendation {
  bestLayer:   ChainLayer;
  windows:     DeployWindow[];
  evaluatedAt: number;
}

// ── Internal state ─────────────────────────────────────────────────────────────

const _windowHistory: DeployWindow[] = [];

// ── Scoring ───────────────────────────────────────────────────────────────────

function scoreWindow(
  layer:     ChainLayer,
  gasPrice:  bigint,
  latencyMs: number,
  healthy:   boolean,
): { score: number; reason: string } {
  if (!healthy) {
    return { score: 0, reason: "Chain is unhealthy — deployment not recommended" };
  }

  const gasPriceGwei = Number(gasPrice) / 1e9;

  // Gas component: lower = better, normalised to 0–1 (cap at 100 gwei)
  const gasScore    = Math.max(0, 1 - gasPriceGwei / 100);
  // Latency component: lower = better
  const latScore    = Math.max(0, 1 - latencyMs / LATENCY_MAX_MS);
  // Layer preference: L2/L3 have lower fees in practice
  const layerBonus  = layer === "l1" ? 0 : 0.1;

  const score  = Math.min(1, gasScore * 0.6 + latScore * 0.3 + layerBonus + 0.1);

  let reason: string;
  if (gasPrice <= GAS_LOW_THRESHOLD) {
    reason = `Gas price ${gasPriceGwei.toFixed(2)} gwei is well below threshold — excellent window`;
  } else if (latencyMs < 500) {
    reason = `Fast RPC (${latencyMs}ms) with moderate gas ${gasPriceGwei.toFixed(2)} gwei`;
  } else {
    reason = `Gas ${gasPriceGwei.toFixed(2)} gwei, latency ${latencyMs}ms — acceptable window`;
  }

  return { score, reason };
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Evaluate all chains and return a deployment recommendation.
 */
export function evaluateDeploymentWindow(): DeployRecommendation {
  const statuses = getChainStatus();
  const windows: DeployWindow[] = [];

  for (const s of statuses) {
    const { score, reason } = scoreWindow(s.layer, s.gasPrice, s.latencyMs, s.healthy);
    const gasPriceGwei      = Number(s.gasPrice) / 1e9;

    const window: DeployWindow = {
      layer:        s.layer,
      chainId:      s.chainId,
      gasPrice:     s.gasPrice,
      gasPriceGwei,
      latencyMs:    s.latencyMs,
      score,
      recommended:  score >= 0.6,
      reason,
      evaluatedAt:  Date.now(),
    };
    windows.push(window);
    _windowHistory.push(window);
  }

  // Trim history
  while (_windowHistory.length > WINDOW_HISTORY_MAX) _windowHistory.shift();

  // Pick best window
  const sorted  = [...windows].sort((a, b) => b.score - a.score);
  const best    = sorted[0];
  const bestLayer = best?.layer ?? "l2";

  if (best && best.score >= 0.6) {
    store_event({
      resourceId: bestLayer,
      layer:      "chain" as const,
      category:   "deployment",
      label:      "deploy_window_good",
      severity:   "info",
      payload:    { score: best.score, gasPriceGwei: best.gasPriceGwei, latencyMs: best.latencyMs },
    });
  } else if (best && best.score < 0.3) {
    store_event({
      resourceId: bestLayer,
      layer:      "chain" as const,
      category:   "deployment",
      label:      "deploy_window_poor",
      severity:   "warning",
      payload:    { score: best.score, reason: best.reason },
    });
  }

  log.debug("deployment_optimizer: evaluated", `bestLayer=${bestLayer} score=${best?.score?.toFixed(2) ?? "N/A"}`);

  return { bestLayer, windows, evaluatedAt: Date.now() };
}

/**
 * Get the recommended deployment layer (quick helper).
 */
export function recommendDeployLayer(): ChainLayer {
  return evaluateDeploymentWindow().bestLayer;
}

export function getDeploymentOptimizerStats() {
  return {
    windowHistorySize: _windowHistory.length,
    lastEvaluation:    _windowHistory.at(-1)?.evaluatedAt ?? null,
    recentWindows:     _windowHistory.slice(-10),
  };
}
