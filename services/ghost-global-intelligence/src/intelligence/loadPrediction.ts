/**
 * @file src/intelligence/loadPrediction.ts
 * Ghost Global Network Intelligence — Network load forecasting.
 *
 * Maintains a sliding window of TPS, peer count, and block-time samples
 * collected from topology polls.  Uses least-squares linear extrapolation
 * to forecast load 5–15 minutes ahead and recommend preemptive expansion.
 *
 * No external ML libraries — all computation is pure arithmetic.
 */

import type { TopologySnapshot, LoadSample, LoadForecast } from '../types.js';

const WINDOW_CAPACITY = parseInt(process.env.GNI_PREDICTION_WINDOW ?? '30', 10); // ~30 min at 1-min polls
const TPS_EXPAND_THRESHOLD     = parseFloat(process.env.GNI_TPS_EXPAND     ?? '500');
const PEER_EXPAND_PCT_DROP     = parseFloat(process.env.GNI_PEER_DROP_PCT  ?? '0.30'); // 30 % drop

const _samples: LoadSample[] = [];

/** Feed a new topology snapshot into the prediction window. */
export function recordSample(snapshot: TopologySnapshot, tps: number): void {
  const sample: LoadSample = {
    ts:          snapshot.ts,
    tps,
    peerCount:   snapshot.totalPeers,
    blockTimeMs: 0, // populated by server when block-time data is available
  };
  _samples.push(sample);
  if (_samples.length > WINDOW_CAPACITY) _samples.shift();
}

// ── Least-squares slope ────────────────────────────────────────────────────────
function slope(ys: number[]): number {
  const n = ys.length;
  if (n < 2) return 0;
  const xs   = ys.map((_, i) => i);
  const sx   = xs.reduce((a, x) => a + x, 0);
  const sy   = ys.reduce((a, y) => a + y, 0);
  const sxy  = xs.reduce((a, x, i) => a + x * ys[i], 0);
  const sx2  = xs.reduce((a, x) => a + x * x, 0);
  const denom = n * sx2 - sx * sx;
  return denom === 0 ? 0 : (n * sxy - sx * sy) / denom;
}

function last(arr: number[]): number { return arr[arr.length - 1] ?? 0; }

export function computeForecast(): LoadForecast {
  if (_samples.length < 3) {
    return {
      estimatedTps:         0,
      estimatedPeers:       0,
      expansionRecommended: false,
      confidence:           0,
      reason:               'insufficient samples for prediction',
    };
  }

  const tpsSeries   = _samples.map(s => s.tps);
  const peerSeries  = _samples.map(s => s.peerCount);

  const tpsSlope    = slope(tpsSeries);
  const peerSlope   = slope(peerSeries);

  // Project 5 steps ahead (5 × poll interval ≈ 5 min)
  const LOOKAHEAD    = 5;
  const estimatedTps   = Math.max(0, last(tpsSeries)  + tpsSlope  * LOOKAHEAD);
  const estimatedPeers = Math.max(0, last(peerSeries) + peerSlope * LOOKAHEAD);

  const confidence = Math.min(1, _samples.length / WINDOW_CAPACITY);

  const reasons: string[] = [];
  let expansionRecommended = false;

  if (estimatedTps > TPS_EXPAND_THRESHOLD) {
    expansionRecommended = true;
    reasons.push(`TPS forecast=${estimatedTps.toFixed(0)} > threshold=${TPS_EXPAND_THRESHOLD}`);
  }

  const currentPeers = last(peerSeries);
  if (currentPeers > 0 && peerSlope < 0) {
    const dropPct = Math.abs(peerSlope * LOOKAHEAD) / currentPeers;
    if (dropPct > PEER_EXPAND_PCT_DROP) {
      expansionRecommended = true;
      reasons.push(`peer count dropping ${(dropPct * 100).toFixed(1)}% over next ${LOOKAHEAD} min`);
    }
  }

  return {
    estimatedTps,
    estimatedPeers,
    expansionRecommended,
    confidence,
    reason: reasons.length > 0 ? reasons.join('; ') : 'nominal load',
  };
}

export function getSamples(): LoadSample[] {
  return _samples.slice();
}
