/**
 * GhostBrain Core — Prometheus Connector
 *
 * Queries Prometheus for metric snapshots used in health signals,
 * SLO verification, and canary evaluation.
 */

import { PROMETHEUS_URL } from "../config.js";
import { logger } from "../logger.js";

interface PrometheusResult {
  metric: Record<string, string>;
  value: [number, string];
}

interface PrometheusQueryResponse {
  status: "success" | "error";
  data: {
    resultType: "vector" | "matrix" | "scalar" | "string";
    result: PrometheusResult[];
  };
  errorType?: string;
  error?: string;
}

export async function queryInstant(
  query: string,
): Promise<PrometheusResult[]> {
  const url = `${PROMETHEUS_URL}/api/v1/query?query=${encodeURIComponent(query)}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(10_000) });

  if (!res.ok) {
    logger.error("Prometheus query failed", { query, status: res.status });
    return [];
  }

  const body = await res.json() as PrometheusQueryResponse;

  if (body.status !== "success") {
    logger.warn("Prometheus returned error", { query, error: body.error });
    return [];
  }

  return body.data.result;
}

/**
 * Get the scalar value of a metric by query.
 * Returns null if not found or on error.
 */
export async function getMetricValue(query: string): Promise<number | null> {
  const results = await queryInstant(query);
  if (results.length === 0) return null;
  const val = parseFloat(results[0]!.value[1]);
  return isNaN(val) ? null : val;
}

/**
 * Evaluate a success metric threshold.
 */
export async function checkSuccessMetric(
  metric: string,
  operator: "lt" | "gt" | "eq" | "lte" | "gte",
  threshold: number,
): Promise<boolean> {
  const val = await getMetricValue(metric);
  if (val === null) return false;

  switch (operator) {
    case "lt":  return val < threshold;
    case "gt":  return val > threshold;
    case "eq":  return val === threshold;
    case "lte": return val <= threshold;
    case "gte": return val >= threshold;
  }
}

/**
 * Snapshot a set of metrics by query strings.
 * Used for before/after evidence packs.
 */
export async function snapshotMetrics(
  queries: Record<string, string>,
): Promise<Record<string, number | null>> {
  const snapshot: Record<string, number | null> = {};
  for (const [name, query] of Object.entries(queries)) {
    snapshot[name] = await getMetricValue(query);
  }
  return snapshot;
}
