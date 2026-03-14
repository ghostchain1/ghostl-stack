/**
 * GhostBrain Cognitive Engine — Strategy Engine
 *
 * Selects the optimal remediation strategy for each step in a CognitivePlan
 * by consulting:
 *
 *   1. Fix memory   — empirical success rates per (problem, actionType) pair
 *   2. Neural graph — successful causal chains matching the event label
 *   3. Predictive query — predictOutcome() for confidence-weighted selection
 *
 * Produces a Strategy that maps each plan step to a concrete action descriptor
 * with optimised parameters and an expected success probability.
 *
 * Prometheus metrics:
 *   ghostbrain_strategy_selections_total
 *   ghostbrain_strategy_success_rate (gauge — rolling average from fix memory)
 */

import { getAllFixes }             from "../memory/fix_memory.js";
import { getSuccessfulChains, predictOutcome } from "../memory/neural_memory_graph.js";
import { inc, set }               from "../observability/metrics_exporter.js";
import { log }                    from "../observability/event_logger.js";
import type { CognitivePlan, PlanStep, PlanStepType } from "./planning_engine.js";
import type { Reasoning }         from "./reasoning_engine.js";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface StepStrategy {
  /** Original plan step this strategy applies to */
  step:            PlanStep;
  /** Merged/optimised action parameters */
  params:          Record<string, unknown>;
  /** Selected fix record ID if from fix memory, else "neural_graph" | "default" */
  source:          string;
  /** Predicted probability of success (0–1) */
  expectedSuccess: number;
  /** Rationale for this strategy choice */
  rationale:       string;
}

export interface Strategy {
  /** Corresponding plan ID */
  planId:          string;
  resourceId:      string;
  layer:           string;
  /** Per-step strategy entries (same length and order as plan.steps) */
  steps:           StepStrategy[];
  /** Weighted average expected success across all steps */
  overallExpected: number;
  /** Source of primary strategy: "fix_memory" | "neural_graph" | "heuristic" */
  primarySource:   string;
  selectedAt:      number;
}

// ── Action-type → fix-memory actionType mapping ───────────────────────────────

const ACTION_FIX_MAP: Partial<Record<PlanStepType, string[]>> = {
  restart_container: ["restart", "restart_container", "redeploy_service"],
  restart_vm:        ["restart", "reallocate", "vm_restart"],
  restart_service:   ["restart", "service_restart"],
  scale_memory:      ["scale_memory", "increase_memory"],
  scale_cpu:         ["scale_cpu", "increase_cpu"],
  rebalance_load:    ["rebalance", "load_rebalance"],
  reroute_traffic:   ["reroute", "traffic_reroute"],
  throttle:          ["throttle"],
  sync_peers:        ["sync_peers", "peer_sync"],
};

// ── Engine ────────────────────────────────────────────────────────────────────

export class StrategyEngine {

  /**
   * Choose the best strategy for every step in a plan.
   * Queries fix memory and neural graph, falls back to heuristic defaults.
   */
  async chooseStrategy(plan: CognitivePlan): Promise<Strategy> {
    inc("ghostbrain_strategy_selections_total", "Strategy selections made by StrategyEngine");

    const { reasoning } = plan;
    const { event } = reasoning;

    // Pre-load fix memory and successful chains once
    const allFixes     = getAllFixes();
    const successChains = await getSuccessfulChains(20).catch(() => []);

    // Predict outcome from neural graph (may return null)
    const prediction = await predictOutcome(event.label).catch(() => null);

    const stepStrategies: StepStrategy[] = [];
    let   totalSuccess  = 0;
    let   primarySource = "heuristic";

    for (const step of plan.steps) {
      const ss = this._strategyForStep(step, reasoning, allFixes, successChains, prediction);
      stepStrategies.push(ss);
      totalSuccess += ss.expectedSuccess;
      if (ss.source === "fix_memory" && primarySource === "heuristic") primarySource = "fix_memory";
      if (ss.source === "neural_graph" && primarySource !== "fix_memory") primarySource = "neural_graph";
    }

    const overallExpected = plan.steps.length > 0
      ? totalSuccess / plan.steps.length
      : 0;

    // Update rolling success-rate gauge
    set("ghostbrain_strategy_success_rate",
      "Rolling expected success rate from StrategyEngine",
      overallExpected);

    log.debug("strategy_engine: selected",
      `plan=${plan.id} source=${primarySource} expected=${(overallExpected * 100).toFixed(1)}%`);

    return {
      planId:          plan.id,
      resourceId:      plan.resourceId,
      layer:           plan.layer,
      steps:           stepStrategies,
      overallExpected,
      primarySource,
      selectedAt:      Date.now(),
    };
  }

  // ── Snapshot of strategy insight (for API) ────────────────────────────────

  async stats(): Promise<{
    totalFixes:      number;
    topFixRate:      number;
    topFixProblem:   string;
    graphChains:     number;
  }> {
    const fixes  = getAllFixes();
    const chains = await getSuccessfulChains(5).catch(() => []);
    const sorted = [...fixes].sort((a, b) => b.successRate - a.successRate);
    return {
      totalFixes:    fixes.length,
      topFixRate:    sorted[0]?.successRate ?? 0,
      topFixProblem: sorted[0]?.problem     ?? "none",
      graphChains:   chains.length,
    };
  }

  // ── Private step resolver ─────────────────────────────────────────────────

  private _strategyForStep(
    step:         PlanStep,
    reasoning:    Reasoning,
    allFixes:     ReturnType<typeof getAllFixes>,
    successChains: Awaited<ReturnType<typeof getSuccessfulChains>>,
    prediction:   Awaited<ReturnType<typeof predictOutcome>>,
  ): StepStrategy {
    const { action, params } = step;

    // ── 1. Fix memory first (empirical ground truth) ──────────────────────
    const fixTypes = ACTION_FIX_MAP[action] ?? [];
    const matchingFixes = allFixes
      .filter(f =>
        fixTypes.includes(f.actionType) &&
        (
          f.problem.toLowerCase().includes(reasoning.event.label.toLowerCase()) ||
          f.problem.toLowerCase().includes(reasoning.event.layer.toLowerCase()) ||
          fixTypes.some(t => f.actionType  === t)
        ),
      )
      .sort((a, b) => b.successRate - a.successRate);

    if (matchingFixes.length > 0) {
      const best = matchingFixes[0]!;
      return {
        step,
        params:          { ...params, ...best.params },
        source:          `fix_memory:${best.id ?? best.problem.slice(0, 20)}`,
        expectedSuccess: best.successRate,
        rationale:       `Fix memory: "${best.solution}" (success rate ${(best.successRate * 100).toFixed(1)}%, n=${best.successCount ?? 0})`,
      };
    }

    // ── 2. Neural graph chains matching step action ────────────────────────
    const chainMatch = successChains.find(c =>
      c.action?.toLowerCase().includes(action.replace(/_/g, " ")) ||
      c.eventLabel.toLowerCase().includes(reasoning.event.label.toLowerCase()),
    );
    if (chainMatch) {
      return {
        step,
        params:          { ...params },
        source:          "neural_graph",
        expectedSuccess: chainMatch.confidence,
        rationale:       `Neural graph: chain "${chainMatch.eventLabel}→${chainMatch.action}" (confidence ${(chainMatch.confidence * 100).toFixed(1)}%)`,
      };
    }

    // ── 3. Neural graph prediction ────────────────────────────────────────
    if (prediction && action !== "collect_diagnostics" && action !== "monitor") {
      return {
        step,
        params:          { ...params },
        source:          "neural_graph",
        expectedSuccess: prediction.confidence,
        rationale:       `Neural prediction: recommended action "${prediction.action}" → "${prediction.outcome}" (confidence ${(prediction.confidence * 100).toFixed(1)}%)`,
      };
    }

    // ── 4. Heuristic defaults ─────────────────────────────────────────────
    const HEURISTIC_SUCCESS: Partial<Record<PlanStepType, number>> = {
      collect_diagnostics: 0.99,
      monitor:             0.99,
      notify:              0.99,
      search_memory:       0.95,
      restart_container:   0.80,
      rebalance_load:      0.85,
      throttle:            0.90,
      scale_memory:        0.75,
      scale_cpu:           0.70,
      restart_vm:          0.65,
      restart_service:     0.72,
      reroute_traffic:     0.78,
      sync_peers:          0.82,
      generate_strategy:   0.88,
    };

    return {
      step,
      params:          { ...params },
      source:          "heuristic",
      expectedSuccess: HEURISTIC_SUCCESS[action] ?? 0.5,
      rationale:       `No historical record — applying heuristic defaults for action "${action}"`,
    };
  }
}

export const strategyEngine = new StrategyEngine();
