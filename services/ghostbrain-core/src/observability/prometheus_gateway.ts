/**
 * GhostBrain — Prometheus Pushgateway Client
 *
 * Periodically pushes the local metrics registry to a Prometheus
 * Pushgateway instance (PROMETHEUS_PUSHGATEWAY_URL env).
 *
 * Falls back gracefully if the pushgateway is not configured.
 */

import { request }            from "undici";
import { toPrometheusText }   from "./metrics_exporter.js";

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

// ── Start / stop periodic push loop ──────────────────────────────────────────

export function startPushLoop(): void {
  if (_pushInterval || !PUSH_URL) return;
  _pushInterval = setInterval(() => { void pushMetrics(); }, PUSH_INT);
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
