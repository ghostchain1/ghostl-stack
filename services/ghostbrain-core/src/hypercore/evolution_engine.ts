/**
 * GhostBrain HyperCore — Evolution Engine
 *
 * GhostBrain's strategic self-improvement layer, operating above the
 * existing self_evolution_engine.ts (which handles per-decision analysis).
 *
 * HyperCore Evolution adds:
 *   • HyperCore cycle quality scoring (insight volume, critical rate, dispatch rate)
 *   • Aggregate decision calibration check (predicted vs actual success)
 *   • Human-review-gated strategy evolution proposals
 *
 * Pipeline (runs every N HyperCore cycles, configurable via HYPERCORE_EVOLVE_EVERY_N):
 *   analyze_decisions()    → score recent cognitive decisions
 *   evaluate_outcomes()    → predicted vs actual repair success calibration
 *   rewrite_strategies()   → advisory strategy update proposals (→ signing relay)
 *   synthesize report      → HyperEvolutionReport (requires_human_review: true)
 *
 * SAFETY:
 *   - This engine NEVER modifies running algorithms autonomously.
 *   - All "updates" produce StrategyUpdate documents forwarded to the signing
 *     relay (:7910) for human review before action.
 *   - Every report is tagged requires_human_review: true.
 *
 * Prometheus metrics:
 *   ghostbrain_hypercore_evolution_cycles_total
 *   ghostbrain_hypercore_evolution_proposals_total
 */

import { randomUUID }    from "node:crypto";
import {
  analyze_decisions,
  evaluate_outcomes,
  rewrite_strategies,
  getEvolutionStats,
  type DecisionScore,
  type OutcomeEvaluation,
  type StrategyUpdate,
}                        from "../self_evolution_engine.js";
import { inc }           from "../observability/metrics_exporter.js";
import { log }           from "../observability/event_logger.js";

// ── Types ─────────────────────────────────────────────────────────────────────

export type EvolutionRecommendation = "stable" | "update_strategy" | "retrain" | "escalate";

/** Compact summary of one HyperCore evaluation cycle for evolution analysis. */
export interface HyperCycleSummary {
  ts:            number;
  insightCount:  number;
  criticalCount: number;
  improvements:  number;
  autonomous:    number;
  strategies:    number;
  chainCritical: number;
}

export interface HyperEvolutionReport {
  id:                    string;
  generatedAt:           string;
  /** Cognitive decision quality scores */
  decisionScores:        DecisionScore[];
  /** Prediction-vs-actual calibration */
  outcomeEvaluation:     OutcomeEvaluation;
  /** Advisory strategy update proposals */
  evolutionUpdates:      StrategyUpdate[];
  /** Rolling average success rate across all scored decisions */
  cognitiveSuccessRate:  number;
  /** Average insights generated per HyperCore cycle in the analysis window */
  avgInsightsPerCycle:   number;
  /** Average critical events per HyperCore cycle */
  avgCriticalPerCycle:   number;
  /** Number of HyperCore cycles used for this analysis */
  hyperCycleCount:       number;
  recommendation:        EvolutionRecommendation;
  /** Always true — no autonomous code modification */
  requires_human_review: true;
}

// ── State ─────────────────────────────────────────────────────────────────────

const _reports: HyperEvolutionReport[] = [];
const MAX_REPORTS                      = 50;
let   _evolutionCycles                 = 0;

function pushReport(r: HyperEvolutionReport): void {
  _reports.push(r);
  if (_reports.length > MAX_REPORTS) _reports.shift();
}

// ── Engine ────────────────────────────────────────────────────────────────────

export class EvolutionEngine {

  /**
   * Run a full evolution cycle over the supplied HyperCore cycle history.
   * Produces a HyperEvolutionReport tagged requires_human_review: true.
   */
  async evolve(hyperCycles: HyperCycleSummary[]): Promise<HyperEvolutionReport> {
    _evolutionCycles++;
    inc("ghostbrain_hypercore_evolution_cycles_total", "Total HyperCore evolution engine invocations");

    // ── 1. Base cognitive layer analysis ─────────────────────────────────────
    const decisionScores: DecisionScore[] = analyze_decisions();
    const outcomeEval:    OutcomeEvaluation = evaluate_outcomes();

    // ── 2. Strategy rewrites (advisory — forwarded to signing relay) ──────────
    let evolutionUpdates: StrategyUpdate[] = [];
    try {
      evolutionUpdates = await rewrite_strategies();
    } catch (err) {
      log.warn("hypercore.evolution_engine", `rewrite_strategies error: ${String(err)}`);
    }

    // ── 3. Aggregate cognitive success rate ───────────────────────────────────
    const cognitiveSuccessRate = decisionScores.length > 0
      ? decisionScores.reduce((s, d) => s + d.successRate, 0) / decisionScores.length
      : 0.5;  // neutral default when no data yet

    // ── 4. HyperCore cycle quality metrics ───────────────────────────────────
    const window = hyperCycles.slice(-20);
    const avgInsightsPerCycle = window.length > 0
      ? window.reduce((s, c) => s + c.insightCount, 0) / window.length : 0;
    const avgCriticalPerCycle = window.length > 0
      ? window.reduce((s, c) => s + c.criticalCount, 0) / window.length : 0;

    // ── 5. Recommendation ────────────────────────────────────────────────────
    let recommendation: EvolutionRecommendation = "stable";

    if (outcomeEval.calibrationError > 0.25 || cognitiveSuccessRate < 0.60) {
      recommendation = "retrain";
    } else if (evolutionUpdates.length > 0 || cognitiveSuccessRate < 0.75) {
      recommendation = "update_strategy";
    } else if (avgCriticalPerCycle > 3) {
      // Sustained elevated crits without improving strategy → escalate
      recommendation = "escalate";
    }

    const report: HyperEvolutionReport = {
      id:                    randomUUID(),
      generatedAt:           new Date().toISOString(),
      decisionScores,
      outcomeEvaluation:     outcomeEval,
      evolutionUpdates,
      cognitiveSuccessRate,
      avgInsightsPerCycle,
      avgCriticalPerCycle,
      hyperCycleCount:       hyperCycles.length,
      recommendation,
      requires_human_review: true,
    };

    pushReport(report);
    inc(
      "ghostbrain_hypercore_evolution_proposals_total",
      "Total evolution proposals generated",
      evolutionUpdates.length,
    );
    log.info(
      "hypercore.evolution_engine",
      `evolve: recommendation=${recommendation} cogSuccess=${(cognitiveSuccessRate * 100).toFixed(1)}% ` +
      `proposals=${evolutionUpdates.length} cycles=${hyperCycles.length}`,
    );

    return report;
  }

  getReports(n = 10): HyperEvolutionReport[] {
    return _reports.slice(-n);
  }

  stats() {
    return {
      evolutionCycles: _evolutionCycles,
      reportsStored:   _reports.length,
      lastReport:      _reports.at(-1)?.generatedAt ?? null,
      baseEvolution:   getEvolutionStats(),
    };
  }
}

export const evolutionEngine = new EvolutionEngine();
