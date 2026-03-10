/**
 * GhostBrain — Prometheus Pushgateway Client
 *
 * Periodically pushes the local metrics registry to a Prometheus
 * Pushgateway instance (PROMETHEUS_PUSHGATEWAY_URL env).
 *
 * Falls back gracefully if the pushgateway is not configured.
 */

import { request }            from "undici";
import { toPrometheusText, set, inc }   from "./metrics_exporter.js";
import { predictiveEngineStats }        from "../predictive/index.js";
import { infraSupervisorStats }         from "../infra/infra_supervisor.js";
import { getAnomalies }                 from "../predictive/anomaly_detector.js";
import { getActiveRisks }               from "../predictive/failure_predictor.js";
import { forecastAll }                  from "../predictive/load_forecaster.js";

const PUSH_URL  = process.env.PROMETHEUS_PUSHGATEWAY_URL ?? "";
const JOB_NAME  = process.env.PROMETHEUS_JOB_NAME       ?? "ghostbrain-core";
const PUSH_INT  = Number(process.env.PROMETHEUS_PUSH_INTERVAL_MS ?? "30000");

let _pushInterval: ReturnType<typeof setInterval> | null = null;
let _lastPushedAt = 0;
let _pushErrors   = 0;
let _pushOk       = 0;

// ── Push a metrics payload ────────────────────────────────────────────────────

export async function pushMetrics(): Promise<{ ok: boolean; detail: string }> {
  if (!PUSH_URL) return { ok: false, detail: "PROMETHEUS_PUSHGATEWAY_URL not configured" };

  const body = toPrometheusText();
  try {
    const res = await request(
      `${PUSH_URL}/metrics/job/${encodeURIComponent(JOB_NAME)}`,
      {
        method:  "POST",
        headers: { "Content-Type": "text/plain" },
        body,
        bodyTimeout: 8_000,
      },
    );
    _lastPushedAt = Date.now();
    if (res.statusCode < 300) {
      _pushOk++;
      return { ok: true, detail: `pushed ${body.length} bytes` };
    }
    _pushErrors++;
    return { ok: false, detail: `pushgateway returned ${res.statusCode}` };
  } catch (e) {
    _pushErrors++;
    return { ok: false, detail: e instanceof Error ? e.message : String(e) };
  }
}

// ── Populate predictive AI metrics before each push ──────────────────────────

function refreshPredictiveMetrics(): void {
  try {
    const ps  = predictiveEngineStats();
    const sis = infraSupervisorStats();

    set("ghostbrain_avg_tick_ms",          "Average predictive engine tick latency ms", ps.avgTickMs);
    set("ghostbrain_memory_hot_entries",   "HOT tier (RAM) snapshot count",             ps.disk.hotEntries);
    set("ghostbrain_memory_warm_lines",    "WARM tier (NVMe) NDJSON line count",        ps.disk.warmLines);
    set("ghostbrain_memory_archive_files", "COLD archive file count",                   ps.disk.archiveFiles);
    set("ghostbrain_active_failure_risks", "Active failure risk entries (elevated+)",   ps.activeRisks.length);
    set("ghostbrain_self_heal_total",      "Self-healing actions total",                sis.selfHealCount);
    set("ghostbrain_crash_prevention_total","Crash prevention actions total",           sis.autoActions);

    // 30 s horizon forecasts for host
    const forecasts30 = forecastAll("host", [30_000]);
    for (const f of forecasts30) {
      if (f.metric === "cpu") set("ghostbrain_prediction_cpu",    "Predicted CPU % at 30s horizon", f.predictedValue);
      if (f.metric === "mem") set("ghostbrain_prediction_memory", "Predicted memory % at 30s horizon", f.predictedValue);
    }

    // Failure risk by horizon
    const risks = getActiveRisks("safe");
    const hostRisks = risks.filter(r => r.resourceId === "host");
    for (const r of hostRisks) {
      const h = r.horizonMs === 30_000 ? "30s" : r.horizonMs === 60_000 ? "60s" : "120s";
      set("ghostbrain_failure_risk_score", "Failure risk score 0-1", r.score, { horizon: h });
    }

    // Active anomalies by severity
    const anomalies = getAnomalies();
    for (const sev of ["critical", "high", "medium", "low"] as const) {
      const count = anomalies.filter(a => a.severity === sev && !a.resolved).length;
      set("ghostbrain_active_anomalies", "Active anomalies by severity", count, { severity: sev });
    }
  } catch { /* never let metric collection crash the push loop */ }
}

// ── Start / stop periodic push loop ──────────────────────────────────────────

export function startPushLoop(): void {
  if (_pushInterval) return;
  // Always push metrics on interval regardless of pushgateway config (for /metrics scrape)
  _pushInterval = setInterval(() => {
    refreshPredictiveMetrics();
    if (PUSH_URL) void pushMetrics();
  }, PUSH_INT);
}

export function stopPushLoop(): void {
  if (_pushInterval) { clearInterval(_pushInterval); _pushInterval = null; }
}

export function pushStats(): {
  configured: boolean;
  lastPushedAt: number;
  errors: number;
  successes: number;
} {
  return {
    configured:   Boolean(PUSH_URL),
    lastPushedAt: _lastPushedAt,
    errors:       _pushErrors,
    successes:    _pushOk,
  };
}
