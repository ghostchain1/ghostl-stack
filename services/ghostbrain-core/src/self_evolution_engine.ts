/**
 * GhostBrain Core — Self-Evolution Engine
 *
 * GhostBrain analyzes its own decision history, evaluates outcomes,
 * and proposes strategy improvements.  This module implements the
 * self-improvement loop described in AGENTS.md §11:
 *
 *   "AI may draft proposals; humans must ratify them."
 *
 * What this engine does:
 *   analyze_decisions()     — score recent AI decisions by outcome quality
 *   evaluate_outcomes()     — compare predicted vs actual repair success rates
 *   optimize_algorithms()   — tune pattern confidence thresholds + weights
 *   rewrite_strategies()    — generate updated strategy recommendations (advisory only)
 *
 * SAFETY:
 *   - This engine NEVER modifies running code autonomously.
 *   - All "rewrites" produce JSON documents (StrategyUpdate) forwarded to
 *     the signing relay (:7910) for human review.
 *   - Self-evolution proposals are tagged requires_human_review: true.
 */

import { request }               from "undici";
import { getTaskLearningStats, getTopLearnedPatterns, optimize_future_task } from "./task_learning_engine.js";
import { getCachedAnalyses }      from "./pattern_analyzer.js";
import { store_decision }         from "./memory_engine.js";
import { log }                    from "./observability/event_logger.js";

// ── Config ────────────────────────────────────────────────────────────────────

const SIGNING_RELAY      = process.env.SIGNING_RELAY_URL    ?? "http://localhost:7910";
const EVOLUTION_INTERVAL = Number(process.env.EVOLUTION_INTERVAL_MS ?? "300000");  // 5 min
const MIN_SAMPLES        = Number(process.env.EVOLUTION_MIN_SAMPLES   ?? "10");     // need ≥10 obs

// ── Types ─────────────────────────────────────────────────────────────────────

export interface DecisionScore {
  agent:        string;
  decisionType: string;
  sampleSize:   number;
  successRate:  number;
  avgDurationMs: number;
  quality:      "excellent" | "good" | "fair" | "poor";
}

export interface OutcomeEvaluation {
  predictedSuccessRate:  number;
  actualSuccessRate:     number;
  calibrationError:      number;   // |predicted − actual|
  recommendation:        string;
}

export interface StrategyUpdate {
  updateId:        string;
  generatedAt:     string;
  type:            "threshold_adjustment" | "weight_rebalance" | "pattern_deprecation" | "new_strategy";
  description:     string;
  currentValue?:   unknown;
  proposedValue?:  unknown;
  rationale:       string;
  expectedImprovement: string;
  requires_human_review: true;
}

// ── State ─────────────────────────────────────────────────────────────────────

const _evolutionLog: StrategyUpdate[] = [];
let _evolutionCycles = 0;
let _interval: ReturnType<typeof setInterval> | null = null;

// ── Analysis functions ────────────────────────────────────────────────────────

/** Score recent AI decisions by outcome quality. */
export function analyze_decisions(): DecisionScore[] {
  const stats    = getTaskLearningStats();
  const patterns = getTopLearnedPatterns(20);
  const scores: DecisionScore[] = [];

  // Group patterns by action type
  const byAction = new Map<string, typeof patterns>();
  for (const p of patterns) {
    const group = byAction.get(p.action) ?? [];
    group.push(p);
    byAction.set(p.action, group);
  }

  for (const [action, group] of byAction) {
    const totalSuccess = group.reduce((s, p) => s + p.successCount, 0);
    const totalTotal   = group.reduce((s, p) => s + p.successCount + p.failureCount, 0);
    if (totalTotal < MIN_SAMPLES) continue;

    const successRate  = totalSuccess / totalTotal;
    const avgDuration  = group.reduce((s, p) => s + p.avgDurationMs, 0) / group.length;
    const quality: DecisionScore["quality"] =
      successRate >= 0.9 ? "excellent" :
      successRate >= 0.7 ? "good" :
      successRate >= 0.5 ? "fair" : "poor";

    scores.push({
      agent:        "GhostRepairBot",
      decisionType: action,
      sampleSize:   totalTotal,
      successRate,
      avgDurationMs: avgDuration,
      quality,
    });
  }

  log.debug("self_evolution: decisions_analyzed", `scored=${scores.length} totalPatterns=${stats.totalPatterns}`);
  return scores.sort((a, b) => b.successRate - a.successRate);
}

/** Compare predicted success rates vs actual outcomes. */
export function evaluate_outcomes(): OutcomeEvaluation {
  const patterns    = getTopLearnedPatterns(50);
  if (patterns.length === 0) {
    return { predictedSuccessRate: 0, actualSuccessRate: 0, calibrationError: 0, recommendation: "Insufficient data" };
  }

  // "predicted" = pattern confidence at last use
  // "actual"    = observed success rate from task learning
  const predicted = patterns.reduce((s, p) => s + p.confidence, 0) / patterns.length;
  const totalSuc  = patterns.reduce((s, p) => s + p.successCount, 0);
  const totalObs  = patterns.reduce((s, p) => s + p.successCount + p.failureCount, 0);
  const actual    = totalObs > 0 ? totalSuc / totalObs : 0;
  const calError  = Math.abs(predicted - actual);

  const recommendation =
    calError > 0.2
      ? `High calibration error (${(calError * 100).toFixed(1)}%) — consider reducing confidence decay rate`
      : calError < 0.05
      ? "Well-calibrated — confidence model is accurate"
      : `Minor calibration gap (${(calError * 100).toFixed(1)}%) — acceptable`;

  return { predictedSuccessRate: predicted, actualSuccessRate: actual, calibrationError: calError, recommendation };
}

/** Tune internal weights and thresholds based on outcome analysis. */
export function optimize_algorithms(): void {
  const scores    = analyze_decisions();
  const outcomes  = evaluate_outcomes();

  // Auto-nudge: penalise low-quality patterns by calling optimize_future_task
  const patterns = getTopLearnedPatterns(20);
  for (const p of patterns) {
    const score = scores.find(s => s.decisionType === p.action);
    if (!score) continue;
    if (score.quality === "poor" && p.successCount + p.failureCount >= MIN_SAMPLES) {
      optimize_future_task(p.triggerEvent, p.action, -1);
      log.info("self_evolution: penalize", `poor pattern: ${p.action}`);
    }
    if (score.quality === "excellent") {
      optimize_future_task(p.triggerEvent, p.action, 1);
    }
  }

  log.debug("self_evolution: algorithms_optimized", `calibrationError=${outcomes.calibrationError.toFixed(4)}`);
}

/** Generate advisory strategy updates for human ratification. */
export async function rewrite_strategies(): Promise<StrategyUpdate[]> {
  const scores   = analyze_decisions();
  const outcomes = evaluate_outcomes();
  const updates: StrategyUpdate[] = [];

  // Suggest deprecating consistently poor strategies
  for (const score of scores) {
    if (score.quality === "poor" && score.sampleSize >= MIN_SAMPLES) {
      updates.push({
        updateId:    `evo-${Date.now()}-${score.decisionType.slice(0, 8)}`,
        generatedAt: new Date().toISOString(),
        type:        "pattern_deprecation",
        description: `Deprecate low-confidence strategy "${score.decisionType}"`,
        currentValue:   score.successRate,
        proposedValue:  null,
        rationale:      `"${score.decisionType}" has only ${(score.successRate * 100).toFixed(1)}% success rate over ${score.sampleSize} samples.`,
        expectedImprovement: "Reduce failed repair attempts; redirect to human review.",
        requires_human_review: true,
      });
    }
  }

  // Suggest threshold adjustment if calibration is off
  if (outcomes.calibrationError > 0.2) {
    updates.push({
      updateId:    `evo-${Date.now()}-threshold`,
      generatedAt: new Date().toISOString(),
      type:        "threshold_adjustment",
      description: "Adjust autonomous repair confidence threshold",
      currentValue:   0.4,
      proposedValue:  Math.max(0.5, 0.4 + outcomes.calibrationError * 0.5),
      rationale:      outcomes.recommendation,
      expectedImprovement: "Fewer false-positive auto-repairs; better confidence calibration.",
      requires_human_review: true,
    });
  }

  // Submit to signing relay
  for (const update of updates) {
    _evolutionLog.push(update);
    await submitToSigningRelay(update);
  }

  // Record as AI decision
  if (updates.length > 0) {
    store_decision({
      agent:        "GhostEvolution",
      decisionType: "self_evolution",
      resourceId:   "ghostbrain-core",
      layer:        "service",
      rationale:    `Generated ${updates.length} strategy update(s) — forwarded for human review.`,
      confidence:   0.8,
      actionTaken:  { updateCount: updates.length, types: updates.map(u => u.type) },
      requiresHuman: true,
      policyGuard:  "REQUIRE_HUMAN_APPROVAL",
    });
  }

  log.info("self_evolution: strategies_generated", `${updates.length} updates forwarded for human review`);
  return updates;
}

// ── Main evolution loop ───────────────────────────────────────────────────────

async function runEvolutionCycle(): Promise<void> {
  _evolutionCycles++;
  log.debug("self_evolution: cycle_start", `cycle=${_evolutionCycles}`);

  optimize_algorithms();
  await rewrite_strategies().catch(err => log.warn("self_evolution: rewrite_failed", String(err)));
}

export function startEvolutionLoop(): void {
  if (_interval) return;
  void runEvolutionCycle();
  _interval = setInterval(() => void runEvolutionCycle(), EVOLUTION_INTERVAL);
  log.info("self_evolution: loop_started", `intervalMs=${EVOLUTION_INTERVAL}`);
}

export function stopEvolutionLoop(): void {
  if (_interval) { clearInterval(_interval); _interval = null; }
}

// ── Stats ─────────────────────────────────────────────────────────────────────

export function getEvolutionStats() {
  return {
    cycles:      _evolutionCycles,
    updatesLog:  _evolutionLog.slice(-20),
    decisionScores: analyze_decisions().slice(0, 10),
    outcomeEvaluation: evaluate_outcomes(),
  };
}

// ── Signing relay ─────────────────────────────────────────────────────────────

async function submitToSigningRelay(update: StrategyUpdate): Promise<void> {
  try {
    await request(SIGNING_RELAY + "/api/v1/proposals", {
      method:      "POST",
      headers:     { "content-type": "application/json" },
      body:        JSON.stringify({ kind: "evolution_update", ...update }),
      bodyTimeout: 5_000,
    });
  } catch {
    log.warn("self_evolution: signing_relay_unreachable", `updateId=${update.updateId}`);
  }
}
