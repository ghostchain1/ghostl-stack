/**
 * GhostBrain Predictive AI — Load Forecaster
 *
 * Lightweight load forecasting using:
 *   - EWMA (Exponentially Weighted Moving Average) for smoothing
 *   - Linear least-squares trend on a sliding window
 *   - Confidence derived from R² of the trend fit
 *
 * No GPU, no heavy ML — runs in < 1 ms per resource.
 */

// ── Types ─────────────────────────────────────────────────────────────────────

export type ForecastMetric = "cpu" | "mem" | "disk" | "net";

export interface MetricSample {
  value: number;
  ts:    number;
}

export interface LoadForecast {
  resourceId:     string;
  metric:         ForecastMetric;
  currentValue:   number;
  predictedValue: number; // at horizon
  horizonMs:      number;
  trend:          "stable" | "rising" | "falling";
  trendSlope:     number; // units/ms
  confidence:     number; // 0–1 R²
  predictedAt:    number;
}

// ── Config ────────────────────────────────────────────────────────────────────

const WINDOW_SIZE  = Number(process.env.FORECAST_WINDOW_SIZE  ?? "30");   // samples kept
const EWMA_ALPHA   = Number(process.env.FORECAST_EWMA_ALPHA   ?? "0.2");  // 0 < α < 1
const STABLE_SLOPE = Number(process.env.FORECAST_STABLE_SLOPE ?? "0.00005"); // per ms

// Default horizons in ms
const HORIZONS: number[] = [30_000, 60_000, 120_000];

// ── Internal state ────────────────────────────────────────────────────────────

// resourceId → metric → sliding window of samples
const _windows = new Map<string, Map<ForecastMetric, MetricSample[]>>();
// resourceId → metric → last EWMA value
const _ewma    = new Map<string, Map<ForecastMetric, number>>();

let _totalForecasts = 0;

// ── Internal helpers ──────────────────────────────────────────────────────────

function getWindow(resourceId: string, metric: ForecastMetric): MetricSample[] {
  if (!_windows.has(resourceId)) _windows.set(resourceId, new Map());
  const m = _windows.get(resourceId)!;
  if (!m.has(metric)) m.set(metric, []);
  return m.get(metric)!;
}

function updateEwma(resourceId: string, metric: ForecastMetric, value: number): number {
  if (!_ewma.has(resourceId)) _ewma.set(resourceId, new Map());
  const m = _ewma.get(resourceId)!;
  const prev = m.get(metric) ?? value;
  const next = EWMA_ALPHA * value + (1 - EWMA_ALPHA) * prev;
  m.set(metric, next);
  return next;
}

/**
 * Ordinary least-squares linear regression on (ts, value) samples.
 * Returns { slope, intercept, rSquared }.
 */
function linearFit(samples: MetricSample[]): { slope: number; intercept: number; rSquared: number } {
  const n = samples.length;
  if (n < 2) return { slope: 0, intercept: samples[0]?.value ?? 0, rSquared: 0 };

  const t0 = samples[0].ts;
  let sumX = 0, sumY = 0, sumXX = 0, sumXY = 0;
  for (const s of samples) {
    const x = s.ts - t0;
    sumX  += x;
    sumY  += s.value;
    sumXX += x * x;
    sumXY += x * s.value;
  }
  const meanX = sumX / n;
  const meanY = sumY / n;
  const denom = sumXX - n * meanX * meanX;
  if (Math.abs(denom) < 1e-12) return { slope: 0, intercept: meanY, rSquared: 0 };

  const slope     = (sumXY - n * meanX * meanY) / denom;
  const intercept = meanY - slope * meanX;

  // R²
  let ssTot = 0, ssRes = 0;
  for (const s of samples) {
    const x      = s.ts - t0;
    const fitted = slope * x + intercept;
    ssRes += (s.value - fitted) ** 2;
    ssTot += (s.value - meanY) ** 2;
  }
  const rSquared = ssTot < 1e-12 ? 1 : Math.max(0, 1 - ssRes / ssTot);

  return { slope, intercept, rSquared };
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Ingest a new metric sample.  Call this every collect cycle.
 */
export function recordSample(resourceId: string, metric: ForecastMetric, value: number, ts = Date.now()): void {
  const win = getWindow(resourceId, metric);
  win.push({ value, ts });
  if (win.length > WINDOW_SIZE) win.shift();
  updateEwma(resourceId, metric, value);
}

/**
 * Forecast the value of `metric` for `resourceId` at each of the given
 * horizons (ms from now).  Returns one `LoadForecast` per horizon.
 */
export function forecast(
  resourceId: string,
  metric:     ForecastMetric,
  horizons:   number[] = HORIZONS,
): LoadForecast[] {
  const win = getWindow(resourceId, metric);
  if (win.length === 0) return [];

  const ewmaMap = _ewma.get(resourceId);
  const current = ewmaMap?.get(metric) ?? win.at(-1)!.value;

  const fit = linearFit(win);
  const now = Date.now();

  _totalForecasts += horizons.length;

  return horizons.map(horizonMs => {
    const predicted = Math.max(0, Math.min(100,
      current + fit.slope * horizonMs,
    ));

    let trend: LoadForecast["trend"];
    if (Math.abs(fit.slope) < STABLE_SLOPE)      trend = "stable";
    else if (fit.slope > 0)                       trend = "rising";
    else                                          trend = "falling";

    return {
      resourceId,
      metric,
      currentValue:   current,
      predictedValue: predicted,
      horizonMs,
      trend,
      trendSlope:     fit.slope,
      confidence:     fit.rSquared,
      predictedAt:    now,
    };
  });
}

/**
 * Forecast all tracked metrics for a resource.
 */
export function forecastAll(resourceId: string, horizons: number[] = HORIZONS): LoadForecast[] {
  const metrics: ForecastMetric[] = ["cpu", "mem", "disk", "net"];
  return metrics.flatMap(m => forecast(resourceId, m, horizons));
}

/** All resource IDs currently tracked. */
export function trackedResources(): string[] {
  return [..._windows.keys()];
}

export function forecasterStats(): {
  resources:      number;
  totalForecasts: number;
  ewmaAlpha:      number;
  windowSize:     number;
} {
  return {
    resources:      _windows.size,
    totalForecasts: _totalForecasts,
    ewmaAlpha:      EWMA_ALPHA,
    windowSize:     WINDOW_SIZE,
  };
}
