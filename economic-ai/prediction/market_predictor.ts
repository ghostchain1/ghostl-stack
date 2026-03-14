/**
 * GhostChain Economic AI Engine — Market Predictor
 *
 * Produces N-epoch-ahead forecasts for three linked economic metrics:
 *
 *   txRate      — transactions per second across all layers
 *   gasPriceGst — recommended base fee in GST smallest unit
 *   burnRateGst — burn rate in GST per second
 *
 * Methodology:
 *   - Ordinary least-squares (OLS) regression fit over the rolling history
 *     for each metric independently (no library dependency).
 *   - Confidence interval computed from the standard deviation of OLS
 *     residuals, yielding a ± σ band around each point forecast.
 *   - A composite supply-pressure signal is derived by combining demand
 *     and burn trend directions.
 *
 * Invariants:
 *   - History buffers are bounded (MAX_HISTORY).
 *   - Predictions are advisory.  Results are forwarded to GhostBrain Core
 *     only; no on-chain action is taken autonomously.
 *   - All GST-denominated values use bigint inputs; forecasts are expressed
 *     as number to support fractional values in the confidence interval.
 */

// ── Types ──────────────────────────────────────────────────────────────────

export interface EconomicObservation {
  epochNumber:  number;
  timestamp:    number;
  chainId:      number;
  txRate:       number;   // transactions per second
  gasPriceGst:  bigint;   // base fee in GST smallest unit
  burnRateGst:  bigint;   // GST burned per second
}

export interface MetricForecast {
  current:        number;
  forecast:       number[];  // length = horizonEpochs
  confidenceBand: number;    // ±1σ width around each forecast point
  trend:          "rising" | "flat" | "falling";
  r2:             number;    // OLS coefficient of determination ∈ [0, 1]
}

export interface MarketPrediction {
  chainId:        number;
  timestamp:      number;
  horizonEpochs:  number;
  txRate:         MetricForecast;
  gasPriceGst:    MetricForecast;  // values in GST smallest unit (rounded to integer)
  burnRateGst:    MetricForecast;
  supplyPressure: "inflationary" | "neutral" | "deflationary";
  confidence:     number;  // 0-1, rises with warmup
}

// ── MarketPredictor ───────────────────────────────────────────────────────

export interface MarketPredictorOptions {
  ghostbrainUrl?: string;
  chainId?:       number;
  /** Number of future epochs to forecast (default 6). */
  horizonEpochs?: number;
  /** Rolling history size (default 72 epochs). */
  historySize?:   number;
  /** Minimum observations before forecasts are meaningful. */
  warmupEpochs?:  number;
}

const MAX_HISTORY = 500;

export class MarketPredictor {
  private readonly ghostbrainUrl: string;
  private readonly chainId:       number;
  private readonly horizonEpochs: number;
  private readonly historySize:   number;
  private readonly warmupEpochs:  number;

  private readonly observations: EconomicObservation[] = [];

  constructor(opts: MarketPredictorOptions = {}) {
    this.ghostbrainUrl = opts.ghostbrainUrl ?? (process.env["GHOSTBRAIN_API_URL"] ?? "http://localhost:7900");
    this.chainId       = opts.chainId       ?? 14000101;
    this.horizonEpochs = Math.max(1, opts.horizonEpochs ?? 6);
    this.historySize   = Math.min(opts.historySize   ?? 72, MAX_HISTORY);
    this.warmupEpochs  = Math.min(opts.warmupEpochs  ?? 12, this.historySize);
  }

  // ── Public API ────────────────────────────────────────────────────────────

  async observe(obs: EconomicObservation): Promise<MarketPrediction> {
    this.validateObs(obs);
    this.observations.push(obs);
    if (this.observations.length > this.historySize) this.observations.shift();

    const prediction = this.predict();

    this.forward(prediction).catch((err: Error) =>
      console.error("[MarketPredictor] GhostBrain forward error:", err.message),
    );

    return prediction;
  }

  currentPrediction(): MarketPrediction {
    return this.predict();
  }

  // ── Internal ──────────────────────────────────────────────────────────────

  private validateObs(obs: EconomicObservation): void {
    if (obs.txRate < 0)       throw new Error("MarketPredictor: txRate cannot be negative");
    if (obs.gasPriceGst < 0n) throw new Error("MarketPredictor: gasPriceGst cannot be negative");
    if (obs.burnRateGst < 0n) throw new Error("MarketPredictor: burnRateGst cannot be negative");
  }

  private predict(): MarketPrediction {
    const n          = this.observations.length;
    const confidence = Math.min(n / this.warmupEpochs, 1.0);
    const ready      = n >= 2;

    const txRateVals    = this.observations.map(o => o.txRate);
    const gasPriceVals  = this.observations.map(o => Number(o.gasPriceGst));
    const burnRateVals  = this.observations.map(o => Number(o.burnRateGst));

    const txRateFc    = ready ? this.olsForecast(txRateVals,   this.horizonEpochs) : this.flatForecast(0, this.horizonEpochs);
    const gasPriceFc  = ready ? this.olsForecast(gasPriceVals, this.horizonEpochs) : this.flatForecast(0, this.horizonEpochs);
    const burnRateFc  = ready ? this.olsForecast(burnRateVals, this.horizonEpochs) : this.flatForecast(0, this.horizonEpochs);

    const supplyPressure = this.supplySignal(txRateFc.trend, burnRateFc.trend);

    return {
      chainId:       this.chainId,
      timestamp:     Math.floor(Date.now() / 1000),
      horizonEpochs: this.horizonEpochs,
      txRate:        txRateFc,
      gasPriceGst:   gasPriceFc,
      burnRateGst:   burnRateFc,
      supplyPressure,
      confidence,
    };
  }

  // ── OLS ──────────────────────────────────────────────────────────────────

  /**
   * Fit y = a + b*t over [0, n-1] and extrapolate t=[n, n+1, ..., n+horizon-1].
   * Returns the MetricForecast including confidence band (±1σ of residuals).
   */
  private olsForecast(ys: number[], horizon: number): MetricForecast {
    const n = ys.length;
    if (n < 2) return this.flatForecast(ys[0] ?? 0, horizon);

    // Compute OLS slope and intercept.
    let sumT = 0, sumY = 0, sumT2 = 0, sumTY = 0;
    for (let i = 0; i < n; i++) {
      const y = ys[i] ?? 0;
      sumT  += i;
      sumY  += y;
      sumT2 += i * i;
      sumTY += i * y;
    }
    const denom = n * sumT2 - sumT * sumT;
    const b = denom !== 0 ? (n * sumTY - sumT * sumY) / denom : 0;
    const a = (sumY - b * sumT) / n;

    // Residuals → σ.
    let ssRes = 0, ssTot = 0;
    const yMean = sumY / n;
    for (let i = 0; i < n; i++) {
      const residual = (ys[i] ?? 0) - (a + b * i);
      ssRes += residual * residual;
      const dev = (ys[i] ?? 0) - yMean;
      ssTot += dev * dev;
    }
    const confidenceBand = n > 2 ? Math.sqrt(ssRes / (n - 2)) : 0;
    const r2 = ssTot > 0 ? Math.max(0, 1 - ssRes / ssTot) : 1;

    // Extrapolate.
    const forecast: number[] = [];
    for (let h = 0; h < horizon; h++) {
      forecast.push(Math.max(0, a + b * (n + h)));
    }

    const trend: MetricForecast["trend"] =
      Math.abs(b) < 1e-12 ? "flat" : b > 0 ? "rising" : "falling";

    return {
      current:        ys[n - 1] ?? 0,
      forecast,
      confidenceBand,
      trend,
      r2,
    };
  }

  private flatForecast(value: number, horizon: number): MetricForecast {
    return {
      current:        value,
      forecast:       Array(horizon).fill(value) as number[],
      confidenceBand: 0,
      trend:          "flat",
      r2:             0,
    };
  }

  private supplySignal(
    demandTrend: MetricForecast["trend"],
    burnTrend:   MetricForecast["trend"],
  ): MarketPrediction["supplyPressure"] {
    if (demandTrend === "rising" && burnTrend !== "rising") return "inflationary";
    if (demandTrend === "falling" && burnTrend === "rising")  return "deflationary";
    if (burnTrend === "rising") return "deflationary";
    return "neutral";
  }

  private async forward(p: MarketPrediction): Promise<void> {
    const resp = await fetch(`${this.ghostbrainUrl}/econ/market-prediction`, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({
        chain_id:       p.chainId,
        gas_token:      "GST",
        timestamp:      p.timestamp,
        horizonEpochs:  p.horizonEpochs,
        txRate:         p.txRate,
        gasPriceGst:    {
          ...p.gasPriceGst,
          current:  Math.round(p.gasPriceGst.current),
          forecast: p.gasPriceGst.forecast.map(v => Math.round(v)),
        },
        burnRateGst:    {
          ...p.burnRateGst,
          current:  Math.round(p.burnRateGst.current),
          forecast: p.burnRateGst.forecast.map(v => Math.round(v)),
        },
        supplyPressure: p.supplyPressure,
        confidence:     p.confidence,
      }),
    });
    if (!resp.ok) throw new Error(`GhostBrain responded ${resp.status}`);
  }
}
