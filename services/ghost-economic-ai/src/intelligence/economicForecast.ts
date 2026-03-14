/**
 * Economic Forecast Engine
 *
 * Uses a sliding window with least-squares linear regression to project:
 *   - TPS (transaction throughput)
 *   - Treasury balance (GST)
 *   - Validator participation rate
 *   - Inflation rate (annualised, derived from treasury inflow)
 *
 * Produces EconomicForecast objects consumed by server.ts and the portal.
 * Window size controlled by AEE_FORECAST_WINDOW (default 20 samples).
 */

import { type ForecastSample, type EconomicForecast, type MarketMetrics, type TreasuryState, type ValidatorMetrics } from '../types.js';

const WINDOW_SIZE     = Number(process.env.AEE_FORECAST_WINDOW ?? 20);
const CYCLE_INTERVAL  = 120;        // seconds between AEE cycles
const HORIZON_MINUTES = 60;         // look-ahead horizon

const _samples: ForecastSample[] = [];
let _lastForecast: EconomicForecast | null = null;

export function recordSample(
  market:     MarketMetrics,
  treasury:   TreasuryState,
  validators: ValidatorMetrics | null
): void {
  _samples.push({
    tps:               market.tpsAvg,
    treasuryGst:       treasury.balanceGst,
    participationRate: validators?.participationRate ?? 0,
    ts:                Date.now(),
  });
  if (_samples.length > WINDOW_SIZE) _samples.shift();
}

/** Ordinary least-squares slope: dy/dt per sample interval. */
function olsSlope(ys: number[]): number {
  const n = ys.length;
  if (n < 2) return 0;
  const xBar = (n - 1) / 2;
  let   num  = 0;
  let   den  = 0;
  for (let i = 0; i < n; i++) {
    const dx = i - xBar;
    num += dx * (ys[i]! - ys.reduce((s, v) => s + v, 0) / n);
    den += dx * dx;
  }
  return den === 0 ? 0 : num / den;
}

function confidence(n: number): number {
  // Ramp from 0 to 1 as we accumulate samples
  return Math.min(1, n / WINDOW_SIZE);
}

export function computeEconomicForecast(): EconomicForecast | null {
  if (_samples.length < 3) return null;

  const steps = (HORIZON_MINUTES * 60) / CYCLE_INTERVAL;

  const tpsSlope          = olsSlope(_samples.map((s) => s.tps));
  const treasurySlope     = olsSlope(_samples.map((s) => s.treasuryGst));
  const participSlope     = olsSlope(_samples.map((s) => s.participationRate));

  const latest = _samples[_samples.length - 1]!;
  const projectedTps               = Math.max(0, latest.tps               + tpsSlope       * steps);
  const projectedTreasuryGst       = Math.max(0, latest.treasuryGst       + treasurySlope  * steps);
  const projectedParticipationRate = Math.min(1, Math.max(0, latest.participationRate + participSlope * steps));

  // Annualised inflation = treasury inflow rate / current balance × 100
  const minutesPerYear = 525_600;
  const minutalInflow  = treasurySlope / (120 / 60); // slope is per cycle; convert to per-minute
  const inflationRatePctPerYear = latest.treasuryGst > 0
    ? (minutalInflow * minutesPerYear / latest.treasuryGst) * 100
    : 0;

  const recommendBurn            = projectedTps > Number(process.env.AEE_BURN_TPS_THRESHOLD ?? 300);
  const recommendMoreValidators  = projectedParticipationRate < Number(process.env.AEE_VALIDATOR_MIN_PARTICIPATION ?? 0.80);

  _lastForecast = {
    projectedTps,
    projectedTreasuryGst,
    projectedParticipationRate,
    inflationRatePctPerYear,
    recommendBurn,
    recommendMoreValidators,
    confidence:        confidence(_samples.length),
    horizonMinutes:    HORIZON_MINUTES,
    ts:                Date.now(),
  };

  return _lastForecast;
}

export function getLastForecast(): EconomicForecast | null {
  return _lastForecast;
}

export function getForecastSamples(): ForecastSample[] {
  return [..._samples];
}
