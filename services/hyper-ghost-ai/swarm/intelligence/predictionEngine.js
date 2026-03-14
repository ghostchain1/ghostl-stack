/**
 * @file swarm/intelligence/predictionEngine.js
 * @description GhostStack AI Swarm — Time-series prediction engine.
 *
 * Maintains a 15-minute sliding window of metrics sampled from anomalyDetection
 * events and direct polling.  Uses simple linear extrapolation (no external ML
 * libraries) to predict near-future degradation risks.
 *
 * Emits:
 *   prediction:validator_risk    — validator likely to jail in next window
 *   prediction:chain_degradation — block rate dropping below minimum
 *   prediction:node_failure      — AI service likely to go offline
 *   prediction:resource_spike    — CPU/RAM heading toward saturation
 *
 * All predictions are advisory only — no proposals are emitted here.
 */

import { swarmBus } from '../messaging/eventBus.js';

// ── Config ────────────────────────────────────────────────────────────────────
const PREDICTION_INTERVAL_MS = parseInt(process.env.PREDICTION_INTERVAL_MS ?? '60000', 10);
const WINDOW_SAMPLES         = parseInt(process.env.PREDICTION_WINDOW_SAMPLES ?? '15', 10); // ~15 min at 1-min intervals
const RISK_THRESHOLD         = parseFloat(process.env.PREDICTION_RISK_THRESHOLD ?? '0.7');

let _runCount   = 0;
let _started    = false;

function log(level, msg, extra = {}) {
  process.stdout.write(
    JSON.stringify({ ts: new Date().toISOString(), level, module: 'prediction-engine', msg, ...extra }) + '\n'
  );
}

// ── Sliding-window metric stores ──────────────────────────────────────────────
// Each entry: { ts, value }  (value is numeric)

function makeSeries(capacity) {
  const buf = [];
  return {
    push(value) {
      buf.push({ ts: Date.now(), value });
      if (buf.length > capacity) buf.shift();
    },
    all() { return buf.slice(); },
    size() { return buf.length; },
  };
}

const series = {
  validatorJailCount:  makeSeries(WINDOW_SAMPLES),
  nodeOfflineCount:    makeSeries(WINDOW_SAMPLES),
  chainStaleCount:     makeSeries(WINDOW_SAMPLES),
  containerCrashCount: makeSeries(WINDOW_SAMPLES),
};

// Per-cycle counters (reset each prediction tick)
let _cycleValidatorJail = 0;
let _cycleNodeOffline   = 0;
let _cycleChainStale    = 0;
let _cycleContainerCrash = 0;

// ── Subscribe to anomaly events to collect metric samples ─────────────────────

swarmBus.on('anomaly:validator_jailed',  () => { _cycleValidatorJail++;   });
swarmBus.on('anomaly:node_offline',      () => { _cycleNodeOffline++;     });
swarmBus.on('anomaly:chain_stale',       () => { _cycleChainStale++;      });
swarmBus.on('anomaly:container',         () => { _cycleContainerCrash++;  });

// ── Linear extrapolation ──────────────────────────────────────────────────────

/**
 * Returns the slope (change per sample) over the series using least-squares.
 * Positive slope = metric is growing; negative = shrinking.
 * @param {{ ts: number, value: number }[]} pts
 * @returns {number}
 */
function slope(pts) {
  if (pts.length < 2) return 0;
  const n  = pts.length;
  const xs = pts.map((_, i) => i);
  const ys = pts.map(p => p.value);
  const sx  = xs.reduce((a, x) => a + x, 0);
  const sy  = ys.reduce((a, y) => a + y, 0);
  const sxy = xs.reduce((a, x, i) => a + x * ys[i], 0);
  const sx2 = xs.reduce((a, x) => a + x * x, 0);
  const denom = n * sx2 - sx * sx;
  if (denom === 0) return 0;
  return (n * sxy - sx * sy) / denom;
}

/**
 * Simple risk score [0,1] based on current level + trend.
 * score = (currentValue / maxExpected) * 0.5 + (slope > 0 ? 0.5 : 0)
 */
function riskScore(pts, maxExpected = 10) {
  if (pts.length === 0) return 0;
  const current = pts[pts.length - 1].value;
  const trendRisk = slope(pts) > 0 ? 0.5 : 0;
  return Math.min(1, (current / maxExpected) * 0.5 + trendRisk);
}

function emit(eventName, payload) {
  swarmBus.emit(eventName, payload);
  swarmBus.emit('swarm:event', { type: eventName, payload, ts: Date.now() });
}

// ── Prediction tick ───────────────────────────────────────────────────────────

function runPrediction() {
  _runCount++;

  // Flush cycle counters into series
  series.validatorJailCount.push(_cycleValidatorJail);
  series.nodeOfflineCount.push(_cycleNodeOffline);
  series.chainStaleCount.push(_cycleChainStale);
  series.containerCrashCount.push(_cycleContainerCrash);
  _cycleValidatorJail = 0;
  _cycleNodeOffline   = 0;
  _cycleChainStale    = 0;
  _cycleContainerCrash = 0;

  // Only predict when we have at least 3 samples
  if (series.validatorJailCount.size() < 3) return;

  const validatorRisk   = riskScore(series.validatorJailCount.all(),  5);
  const nodeRisk        = riskScore(series.nodeOfflineCount.all(),     3);
  const chainRisk       = riskScore(series.chainStaleCount.all(),      3);
  const containerRisk   = riskScore(series.containerCrashCount.all(), 10);

  if (validatorRisk >= RISK_THRESHOLD) {
    emit('prediction:validator_risk', { riskScore: validatorRisk, windowSamples: WINDOW_SAMPLES });
  }
  if (nodeRisk >= RISK_THRESHOLD) {
    emit('prediction:node_failure', { riskScore: nodeRisk, windowSamples: WINDOW_SAMPLES });
  }
  if (chainRisk >= RISK_THRESHOLD) {
    emit('prediction:chain_degradation', { riskScore: chainRisk, windowSamples: WINDOW_SAMPLES });
  }
  if (containerRisk >= RISK_THRESHOLD) {
    emit('prediction:resource_spike', { riskScore: containerRisk, windowSamples: WINDOW_SAMPLES });
  }

  log('debug', 'prediction-tick', {
    run: _runCount,
    validatorRisk: validatorRisk.toFixed(3),
    nodeRisk:      nodeRisk.toFixed(3),
    chainRisk:     chainRisk.toFixed(3),
    containerRisk: containerRisk.toFixed(3),
  });
}

// ── Public API ────────────────────────────────────────────────────────────────

export function startPredictionEngine() {
  if (_started) return;
  _started = true;
  log('info', 'prediction-engine-started', { intervalMs: PREDICTION_INTERVAL_MS, windowSamples: WINDOW_SAMPLES });
  setInterval(runPrediction, PREDICTION_INTERVAL_MS).unref();
}

export function getPredictionStats() {
  return {
    runs:            _runCount,
    intervalMs:      PREDICTION_INTERVAL_MS,
    windowSamples:   WINDOW_SAMPLES,
    riskThreshold:   RISK_THRESHOLD,
    started:         _started,
    currentSamples: {
      validatorJail:  series.validatorJailCount.size(),
      nodeOffline:    series.nodeOfflineCount.size(),
      chainStale:     series.chainStaleCount.size(),
      containerCrash: series.containerCrashCount.size(),
    },
  };
}
