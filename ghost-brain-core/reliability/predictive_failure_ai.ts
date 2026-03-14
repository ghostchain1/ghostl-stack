/**
 * GhostBrain — Predictive Failure AI (TypeScript)
 *
 * Consumes real-time hardware health metrics from the health monitor
 * and applies a statistical / logistic-regression model to predict
 * impending hardware failures before they become service-impacting.
 *
 * Features consumed (per 5-second window):
 *   - thermal_junction_c          (float)
 *   - thermal_throttle_rate       (throttle events / hour)
 *   - ecc_ce_rate                 (corrected errors / hour across all banks)
 *   - ecc_ued_count               (total uncorrectable — non-zero = immediate alert)
 *   - vdd_droop_rate              (droop events / hour)
 *   - link_correctable_rate       (PCIe CE / hour)
 *   - heartbeat_miss_rate         (missed heartbeat windows / hour)
 *
 * Output:
 *   - failure_probability         (0.0–1.0)
 *   - predicted_failure_mode      ("thermal" | "ecc" | "power" | "link" | "none")
 *   - estimated_time_to_failure_h (hours; undefined if none)
 *   - alert_level                 ("ok" | "warn" | "critical")
 *
 * On critical: posts a governance proposal to GhostChain L1 for human
 * ratification — no autonomous on-chain action without quorum approval.
 */

import type { IncomingMessage } from "node:http";
import http from "node:http";

// ── Environment ────────────────────────────────────────────────────────────

const HEALTH_MONITOR_URL = process.env["HEALTH_MONITOR_URL"] ?? "http://localhost:7901";
const GHOSTCHAIN_L1_RPC  = process.env["GHOSTCHAIN_L1_RPC"]  ?? "http://localhost:18545";
const DEVICE_ID          = process.env["GHOSTBRAIN_DEVICE_ID"] ?? "ghost-brain-dev-0";

// ── Types ──────────────────────────────────────────────────────────────────

interface HealthSample {
  ts_ms:          number;
  overall:        "ok" | "warn" | "critical";
  thermal: {
    junction_c:  number;
    throttled:   boolean;
    level:       string;
  };
  ecc_ce_total:   number;
  ecc_ued_total:  number;
  vdd_core_v:     number;
  droop_events:   number;
  link_ok:        boolean;
}

interface FeatureVector {
  thermal_c:          number;   // junction temperature
  throttle_rate:      number;   // throttle events/hour
  ce_rate:            number;   // corrected ECC errors/hour
  ued_count:          number;   // total uncorrectable ECC errors
  droop_rate:         number;   // droop events/hour
  link_ce_rate:       number;   // link correctable errors/hour
  heartbeat_miss:     number;   // missed heartbeats in last hour
}

interface PredictionResult {
  device_id:                  string;
  timestamp_ms:               number;
  failure_probability:        number;
  predicted_failure_mode:     "thermal" | "ecc" | "power" | "link" | "none";
  estimated_time_to_failure_h?: number;
  alert_level:                "ok" | "warn" | "critical";
  features:                   FeatureVector;
}

// ── Feature extraction ─────────────────────────────────────────────────────

class RollingWindow {
  #samples: HealthSample[] = [];
  #windowMs: number;

  constructor(windowMs = 3600_000) {   // 1-hour default window
    this.#windowMs = windowMs;
  }

  push(s: HealthSample): void {
    this.#samples.push(s);
    const cutoff = s.ts_ms - this.#windowMs;
    this.#samples = this.#samples.filter(x => x.ts_ms >= cutoff);
  }

  extract(): FeatureVector {
    const n     = this.#samples.length;
    if (n === 0) return zeroFeatures();

    const latest = this.#samples[n - 1]!;
    const hours  = this.#windowMs / 3600_000;

    // Count throttle events (transitions into throttled=true).
    let throttleEvents = 0;
    for (let i = 1; i < n; i++) {
      if (!this.#samples[i-1]!.thermal.throttled && this.#samples[i]!.thermal.throttled) {
        throttleEvents++;
      }
    }

    // Count droop events across all samples.
    const droopEvents = this.#samples.reduce((s, x) => s + (x.droop_events ?? 0), 0);

    // CE rate: delta over window.
    const oldest   = this.#samples[0]!;
    const ceDelta  = latest.ecc_ce_total - oldest.ecc_ce_total;
    const ceRate   = ceDelta / hours;

    return {
      thermal_c:       latest.thermal.junction_c,
      throttle_rate:   throttleEvents / hours,
      ce_rate:         Math.max(0, ceRate),
      ued_count:       latest.ecc_ued_total,
      droop_rate:      droopEvents / hours,
      link_ce_rate:    latest.link_ok ? 0 : 5 / hours,  // estimate if link not ok
      heartbeat_miss:  0,   // populated from separate heartbeat monitor
    };
  }

  get sampleCount(): number { return this.#samples.length; }
}

function zeroFeatures(): FeatureVector {
  return { thermal_c: 25, throttle_rate: 0, ce_rate: 0, ued_count: 0,
           droop_rate: 0, link_ce_rate: 0, heartbeat_miss: 0 };
}

// ── Logistic Regression Model ──────────────────────────────────────────────
//
// Trained offline on synthetic fault injection + historical FIT data.
// Coefficients are intentionally conservative (favour false positives over
// missed detections for safety-critical hardware).
//
// Model: P(failure) = sigmoid(w · x + b)
// Failure modes: argmax of per-mode sub-models
//
// NOTE: Replace with a proper ONNX model in production.

const WEIGHTS: Record<keyof FeatureVector, number> = {
  thermal_c:       0.025,    // +2.5% per °C above reference
  throttle_rate:   0.30,     // +30% per throttle event/hour
  ce_rate:         0.008,    // +0.8% per CE/hour
  ued_count:       3.0,      // immediate critical if any UED
  droop_rate:      0.15,     // +15% per droop/hour
  link_ce_rate:    0.05,     // +5% per link CE/hour
  heartbeat_miss:  0.50,     // +50% per missed heartbeat window
};

const BIAS             = -2.0;   // calibrated intercept
const TEMP_OFFSET      = 60.0;   // normalise: features[thermal_c] - TEMP_OFFSET

function sigmoid(x: number): number {
  return 1 / (1 + Math.exp(-x));
}

function predictFailure(fv: FeatureVector): PredictionResult {
  // Normalise temperature.
  const tx = fv.thermal_c - TEMP_OFFSET;

  const logit =
    BIAS +
    WEIGHTS.thermal_c       * tx +
    WEIGHTS.throttle_rate   * fv.throttle_rate +
    WEIGHTS.ce_rate         * fv.ce_rate +
    WEIGHTS.ued_count       * fv.ued_count +
    WEIGHTS.droop_rate      * fv.droop_rate +
    WEIGHTS.link_ce_rate    * fv.link_ce_rate +
    WEIGHTS.heartbeat_miss  * fv.heartbeat_miss;

  const prob = sigmoid(logit);

  // Determine dominant failure mode.
  const contributions: [string, number][] = [
    ["thermal", WEIGHTS.thermal_c * tx + WEIGHTS.throttle_rate * fv.throttle_rate],
    ["ecc",     WEIGHTS.ce_rate   * fv.ce_rate + WEIGHTS.ued_count * fv.ued_count],
    ["power",   WEIGHTS.droop_rate * fv.droop_rate],
    ["link",    WEIGHTS.link_ce_rate * fv.link_ce_rate],
  ];
  contributions.sort((a, b) => b[1]! - a[1]!);
  const mode = prob > 0.1 ? contributions[0]![0] as "thermal"|"ecc"|"power"|"link" : "none";

  // Rough TTF estimate (hours): inverse of failure rate assuming Poisson.
  const ttf = prob > 0.01 ? Math.log(1 / prob) / 0.1 : undefined;

  const alert: "ok" | "warn" | "critical" =
    fv.ued_count > 0 || prob > 0.7 ? "critical" :
    prob > 0.3                     ? "warn"
                                   : "ok";

  return {
    device_id:                   DEVICE_ID,
    timestamp_ms:                Date.now(),
    failure_probability:         prob,
    predicted_failure_mode:      mode,
    estimated_time_to_failure_h: ttf,
    alert_level:                 alert,
    features:                    fv,
  };
}

// ── Governance Proposal (L1) ───────────────────────────────────────────────
//
// On critical prediction: post a proposal to GhostChain L1 governor for
// human ratification. Does NOT execute on-chain autonomously.

async function postGovernanceAlert(result: PredictionResult): Promise<void> {
  const description =
    `GhostBrain Predictive Failure Alert\n` +
    `Device: ${result.device_id}\n` +
    `Mode: ${result.predicted_failure_mode}\n` +
    `P(failure): ${(result.failure_probability * 100).toFixed(1)}%\n` +
    `${result.estimated_time_to_failure_h !== undefined
        ? `Estimated TTF: ${result.estimated_time_to_failure_h.toFixed(1)}h`
        : "Immediate attention required (UED detected)"}`;

  const body = JSON.stringify({
    jsonrpc: "2.0",
    id:      1,
    method:  "ghost_call",
    params:  [{
      to:   "0x7B3Be2dDDdDf9A0a3fE1DC57B98980F662C3a422",
      data: "0x" + Buffer.from(JSON.stringify({
        action:      "submit_hardware_alert",
        device_id:   result.device_id,
        alert_level: result.alert_level,
        description,
        timestamp:   result.timestamp_ms,
      })).toString("hex"),
    }, "latest"],
  });

  try {
    const res = await fetch(GHOSTCHAIN_L1_RPC, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body,
    });
    if (!res.ok) {
      console.error(`[PredictiveAI] L1 governance alert failed (${res.status})`);
    } else {
      console.warn(`[PredictiveAI] Governance alert submitted for human ratification`);
    }
  } catch (err) {
    console.error(`[PredictiveAI] L1 RPC unreachable:`, err);
  }
}

// ── Main polling loop ──────────────────────────────────────────────────────

async function fetchHealthSample(): Promise<HealthSample | null> {
  try {
    const res = await fetch(`${HEALTH_MONITOR_URL}/health`);
    if (!res.ok) return null;
    return await res.json() as HealthSample;
  } catch {
    return null;
  }
}

async function main(): Promise<void> {
  console.log("[PredictiveAI] GhostBrain Predictive Failure AI starting...");
  const window = new RollingWindow(3_600_000);   // 1-hour window
  let lastAlertLevel = "ok";

  setInterval(async () => {
    const sample = await fetchHealthSample();
    if (!sample) return;

    window.push(sample);
    if (window.sampleCount < 2) return;

    const features = window.extract();
    const result   = predictFailure(features);

    console.log(JSON.stringify({
      ts:    result.timestamp_ms,
      id:    result.device_id,
      prob:  result.failure_probability.toFixed(4),
      mode:  result.predicted_failure_mode,
      alert: result.alert_level,
      ttf_h: result.estimated_time_to_failure_h?.toFixed(1),
    }));

    // Only post governance alert when level escalates.
    if (result.alert_level === "critical" && lastAlertLevel !== "critical") {
      await postGovernanceAlert(result);
    }
    lastAlertLevel = result.alert_level;
  }, 5_000);   // poll every 5 seconds
}

main().catch(err => {
  console.error("[PredictiveAI] Fatal error:", err);
  process.exit(1);
});
