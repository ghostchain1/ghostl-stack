/**
 * learningEngine.ts — Adaptive weight-based learning from ecosystem events
 *
 * Reads memory events, correlates category × outcome pairs, and maintains
 * a lightweight model that improves over repeated learning cycles.
 * No external ML library is used — all math is simple weight updates.
 */

import logger from "../utils/logger";
import { getMemories, type MemoryCategory } from "../memory/memoryStore";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface LearningModel {
  version:     number;
  cycles:      number;
  lastUpdated: number;
  /** Signal key → weight [0-1]. Key format: "category:signal" */
  weights:     Record<string, number>;
}

export interface LearningInsight {
  signal:      string;
  category:    MemoryCategory;
  weight:      number;       // current learned weight
  confidence:  number;       // 0-1 based on sample size
  sampleCount: number;
  description: string;
}

// ── Storage ───────────────────────────────────────────────────────────────────

const MAX_INSIGHTS = 200;
let model: LearningModel = {
  version: 1,
  cycles:  0,
  lastUpdated: Date.now(),
  weights: {},
};

const insightHistory:  LearningInsight[] = [];
const sampleCounts:    Record<string, number> = {};

// ── Signal extraction ─────────────────────────────────────────────────────────

const POSITIVE_KEYWORDS = ["growth", "increase", "joined", "deployed", "launched", "success", "secured", "resolved", "approved", "activated"];
const NEGATIVE_KEYWORDS = ["offline", "failed", "dropped", "threat", "attack", "rejected", "slashed", "critical", "down", "error"];

function inferOutcome(event: string, outcome?: string): "positive" | "negative" | "neutral" {
  if (outcome === "positive") return "positive";
  if (outcome === "negative") return "negative";
  const ev = event.toLowerCase();
  if (POSITIVE_KEYWORDS.some((k) => ev.includes(k))) return "positive";
  if (NEGATIVE_KEYWORDS.some((k) => ev.includes(k))) return "negative";
  return "neutral";
}

function extractSignal(event: string): string {
  // Normalise to a short signal key (first 4 significant words)
  return event
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, "")
    .split(" ")
    .filter((w) => w.length > 2)
    .slice(0, 4)
    .join("-");
}

// ── Weight-update rule ────────────────────────────────────────────────────────

const POSITIVE_DELTA  =  0.10;
const NEGATIVE_DELTA  = -0.05;
const NEUTRAL_DECAY   = -0.01; // very slight decay for neutral events
const WEIGHT_MIN      = 0.0;
const WEIGHT_MAX      = 1.0;

function updateWeight(current: number | undefined, outcome: "positive" | "negative" | "neutral"): number {
  const w = current ?? 0.5; // start at mid-range
  const delta =
    outcome === "positive" ? POSITIVE_DELTA :
    outcome === "negative" ? NEGATIVE_DELTA :
    NEUTRAL_DECAY;
  return Math.max(WEIGHT_MIN, Math.min(WEIGHT_MAX, w + delta));
}

// ── Learning cycle ────────────────────────────────────────────────────────────

export function learnFromMemories(sampleSize = 500): LearningInsight[] {
  const memories = getMemories({ limit: sampleSize });
  const cycleInsights: LearningInsight[] = [];
  const touched = new Set<string>();

  for (const mem of memories) {
    const signal    = extractSignal(mem.event);
    const outcome   = inferOutcome(mem.event, mem.outcome);
    const key       = `${mem.category}:${signal}`;

    model.weights[key] = updateWeight(model.weights[key], outcome);
    sampleCounts[key]  = (sampleCounts[key] ?? 0) + 1;
    touched.add(key);
  }

  // Build insights from updated weights
  for (const key of touched) {
    const [category, ...rest] = key.split(":");
    const signal  = rest.join(":");
    const weight  = model.weights[key];
    const samples = sampleCounts[key] ?? 1;
    const confidence = Math.min(1, samples / 50); // saturates at 50 samples

    cycleInsights.push({
      signal,
      category:    category as MemoryCategory,
      weight,
      confidence,
      sampleCount: samples,
      description: `${category} signal "${signal}" has weight ${weight.toFixed(3)} (${
        weight >= 0.65 ? "strong positive" :
        weight >= 0.5  ? "positive"        :
        weight >= 0.4  ? "neutral"         :
        weight >= 0.25 ? "negative"        :
        "strong negative"
      })`,
    });
  }

  // Sort by weight desc, keep top insights
  cycleInsights.sort((a, b) => b.weight - a.weight);

  // Store into history (prepend cycle insights)
  insightHistory.unshift(...cycleInsights);
  if (insightHistory.length > MAX_INSIGHTS) insightHistory.splice(MAX_INSIGHTS);

  model.cycles++;
  model.version++;
  model.lastUpdated = Date.now();

  logger.info(`[LearningEngine] Cycle ${model.cycles} — processed ${memories.length} events, updated ${touched.size} signals`);
  return cycleInsights;
}

// ── Top signals ───────────────────────────────────────────────────────────────

export function getTopSignals(n = 10): string[] {
  return Object.entries(model.weights)
    .sort(([, a], [, b]) => b - a)
    .slice(0, n)
    .map(([key]) => key);
}

export function getBottomSignals(n = 5): string[] {
  return Object.entries(model.weights)
    .filter(([, w]) => w < 0.4)
    .sort(([, a], [, b]) => a - b)
    .slice(0, n)
    .map(([key]) => key);
}

// ── Public API ────────────────────────────────────────────────────────────────

export function getModel():                     LearningModel       { return { ...model, weights: { ...model.weights } }; }
export function getInsights(limit = 50):        LearningInsight[]   { return insightHistory.slice(0, limit); }
export function getLearningStats() {
  return {
    cycles:       model.cycles,
    modelVersion: model.version,
    totalSignals: Object.keys(model.weights).length,
    insights:     insightHistory.length,
    topSignals:   getTopSignals(5),
    riskSignals:  getBottomSignals(3),
    lastUpdated:  model.lastUpdated,
  };
}
