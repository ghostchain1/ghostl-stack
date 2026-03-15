/**
 * predictionEngine.ts — Short-to-medium range ecosystem forecasting
 *
 * Uses exponential smoothing on collected EcosystemSnapshot history.
 * When < 3 snapshots exist falls back to conservative synthetic rates.
 * Produces 30 / 60 / 90 day horizon predictions for key metrics.
 */

import logger from "../utils/logger";
import { getSnapshotHistory } from "../data/dataAggregator";

// ── Types ─────────────────────────────────────────────────────────────────────

export type PredictionHorizon = "30d" | "60d" | "90d";
export type PredictionMethod  = "exponential-smoothing" | "linear-trend" | "synthetic";

export interface MetricForecast {
  current:    number | null;
  forecast:   number | null;
  growthRate: number | null;   // fraction per day (null = unknown)
}

export interface PredictionResult {
  id:        string;
  timestamp: number;
  horizon:   PredictionHorizon;
  daysOut:   number;
  method:    PredictionMethod;
  basisSize: number;            // number of snapshots used

  predictions: {
    users:      MetricForecast;
    tvl:        MetricForecast;
    validators: MetricForecast;
    threats:    MetricForecast;
    ecosystemHealth: number;    // 0-100 composite score
  };

  confidence: number;           // 0-1
}

// ── Storage ───────────────────────────────────────────────────────────────────

const MAX_PRED_HISTORY = 500;
const predictionHistory: PredictionResult[] = [];
let latestPredictions:   PredictionResult[] = [];

// ── Maths helpers ─────────────────────────────────────────────────────────────

const ALPHA = 0.35; // exponential smoothing factor

/** Applies α-level exponential smoothing to a series and returns the smoohed value. */
function exponentialSmooth(values: (number | null)[]): number | null {
  const clean = values.filter((v): v is number => v !== null && isFinite(v));
  if (clean.length === 0) return null;
  let s = clean[0];
  for (let i = 1; i < clean.length; i++) s = ALPHA * clean[i] + (1 - ALPHA) * s;
  return s;
}

/** Computes mean daily growth rate from an ordered (oldest→newest) value series. */
function dailyGrowthRate(
  values: (number | null)[],
  intervalMs: number,
): number | null {
  const clean = values.filter((v): v is number => v !== null && v > 0 && isFinite(v));
  if (clean.length < 2) return null;
  const totalDays = ((clean.length - 1) * intervalMs) / 86_400_000;
  if (totalDays === 0) return null;
  const rate = (clean[clean.length - 1] - clean[0]) / clean[0] / totalDays;
  return isFinite(rate) ? rate : null;
}

function project(current: number | null, rate: number | null, days: number): number | null {
  if (current === null || rate === null) return null;
  return current * Math.pow(1 + rate, days);
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

// ── Confidence formula ────────────────────────────────────────────────────────

function computeConfidence(basisSize: number, method: PredictionMethod): number {
  if (method === "synthetic") return 0.35;
  const base = method === "exponential-smoothing" ? 0.6 : 0.5;
  const bonus = Math.min(0.35, basisSize / 200 * 0.35); // up to +35 % for 200 samples
  return clamp(base + bonus, 0, 0.97);
}

// ── Ecosystem health ──────────────────────────────────────────────────────────

function computeEcosystemHealth(
  onlineRatio:   number,
  usersMoM:      number | null,
  tvlMoM:        number | null,
  threatScore:   number | null,
): number {
  let score = onlineRatio * 40; // 0-40 from uptime

  if (usersMoM !== null) {
    score += clamp(usersMoM * 200, -10, 25); // growth adds up to 25 pts
  } else {
    score += 10; // neutral
  }

  if (tvlMoM !== null) {
    score += clamp(tvlMoM * 100, -10, 20);
  } else {
    score += 8;
  }

  if (threatScore !== null) {
    score += threatScore > 5 ? 0 : threatScore > 2 ? 10 : 15;
  } else {
    score += 10;
  }

  return clamp(score, 0, 100);
}

// ── Main prediction run ───────────────────────────────────────────────────────

export async function runPredictions(): Promise<PredictionResult[]> {
  const snaps = getSnapshotHistory(100); // newest first from dataAggregator

  // Reverse to oldest-first for trend calculations
  const ordered = [...snaps].reverse();
  const basisSize = ordered.length;

  // Estimated collection interval (default 30 s)
  const intervalMs =
    basisSize >= 2
      ? (ordered[ordered.length - 1].timestamp - ordered[0].timestamp) / (basisSize - 1)
      : 30_000;

  // Build metric time-series
  const userSeries      = ordered.map((s) => s.users);
  const tvlSeries       = ordered.map((s) => s.tvl);
  const validatorSeries = ordered.map((s) => s.validators);
  const threatSeries    = ordered.map((s) => s.threats);

  // Smoothed current values
  const smoothedUsers  = exponentialSmooth(userSeries);
  const smoothedTvl    = exponentialSmooth(tvlSeries);
  const smoothedVals   = exponentialSmooth(validatorSeries);
  const smoothedThreats= exponentialSmooth(threatSeries);

  // Daily growth rates
  const userRate  = dailyGrowthRate(userSeries,      intervalMs);
  const tvlRate   = dailyGrowthRate(tvlSeries,       intervalMs);
  const valRate   = dailyGrowthRate(validatorSeries, intervalMs);
  const threatRate= dailyGrowthRate(threatSeries,    intervalMs);

  // Synthetic fallbacks (conservative bootstrap rates)
  const synthUserRate  = 0.0035; // +0.35%/day ≈ +12%/month
  const synthTvlRate   = 0.0042; // +0.42%/day ≈ +13%/month
  const synthValRate   = 0.0020;
  const synthThreatRate= 0.0000;

  const method: PredictionMethod = basisSize >= 3
    ? (basisSize >= 20 ? "exponential-smoothing" : "linear-trend")
    : "synthetic";

  const horizons: Array<{ label: PredictionHorizon; days: number }> = [
    { label: "30d", days: 30 },
    { label: "60d", days: 60 },
    { label: "90d", days: 90 },
  ];

  // Online ratio from latest snapshot
  const latestSnap = snaps[0] ?? null;
  const onlineRatio = latestSnap
    ? Object.values(latestSnap.services).filter((s) => s.online).length /
      Object.keys(latestSnap.services).length
    : 0.8;

  const results: PredictionResult[] = horizons.map(({ label, days }) => {
    const effectiveUserRate   = userRate   ?? synthUserRate;
    const effectiveTvlRate    = tvlRate    ?? synthTvlRate;
    const effectiveValRate    = valRate    ?? synthValRate;
    const effectiveThreatRate = threatRate ?? synthThreatRate;

    const currentUsers  = smoothedUsers  ?? 5_000;
    const currentTvl    = smoothedTvl    ?? 8_000_000;
    const currentVals   = smoothedVals   ?? 120;
    const currentThreats= smoothedThreats ?? 2;

    const forecastUsers  = project(currentUsers,   effectiveUserRate,   days)!;
    const forecastTvl    = project(currentTvl,     effectiveTvlRate,    days)!;
    const forecastVals   = project(currentVals,    effectiveValRate,    days)!;
    const forecastThreats= project(currentThreats, effectiveThreatRate, days)!;

    return {
      id:        `pred-${label}-${Date.now()}`,
      timestamp:  Date.now(),
      horizon:    label,
      daysOut:    days,
      method,
      basisSize,
      predictions: {
        users:      { current: currentUsers,   forecast: forecastUsers,   growthRate: effectiveUserRate },
        tvl:        { current: currentTvl,     forecast: forecastTvl,     growthRate: effectiveTvlRate },
        validators: { current: currentVals,    forecast: forecastVals,    growthRate: effectiveValRate },
        threats:    { current: currentThreats, forecast: forecastThreats, growthRate: effectiveThreatRate },
        ecosystemHealth: computeEcosystemHealth(onlineRatio, userRate, tvlRate, currentThreats),
      },
      confidence: computeConfidence(basisSize, method),
    };
  });

  // Store in history
  predictionHistory.unshift(...results);
  if (predictionHistory.length > MAX_PRED_HISTORY) predictionHistory.splice(MAX_PRED_HISTORY);
  latestPredictions = results;

  logger.info(`[PredictionEngine] Generated ${results.length} forecasts (method=${method}, basis=${basisSize})`);
  return results;
}

export function getLatestPredictions():                 PredictionResult[] { return latestPredictions; }
export function getPredictionHistory(limit = 60):       PredictionResult[] { return predictionHistory.slice(0, limit); }
