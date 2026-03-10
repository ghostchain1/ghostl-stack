/**
 * GhostBrain Self-Evolution Engine — Stability Check
 *
 * Queries the Supervisor API (localhost:9100) for live system metrics
 * and evaluates whether the system is in a healthy-enough state to
 * proceed with staging and submitting an evolution proposal.
 *
 * If the system is already under load (CPU > 80%, MEM > 85%) we defer
 * the proposal rather than adding further pressure.
 *
 * SECURITY INVARIANTS
 * -------------------
 * 1. URL is hardcoded from environment — never user-supplied.
 * 2. fetch() timeout via AbortController — prevents hanging.
 * 3. Response is parsed with strict field validation — no eval().
 * 4. No data from the API response is ever interpolated into commands.
 */

import type { StabilityReport } from "../types.js";

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

/** Supervisor metrics endpoint. */
const SUPERVISOR_URL = (
  process.env["SUPERVISOR_API_URL"] ?? "http://localhost:9100"
).replace(/\/$/, "");

/** Maximum CPU utilisation (%) permitted before deferring a proposal. */
const CPU_THRESHOLD = parseFloat(
  process.env["EVOLUTION_CPU_THRESHOLD"] ?? "80",
);

/** Maximum memory utilisation (%) permitted before deferring a proposal. */
const MEM_THRESHOLD = parseFloat(
  process.env["EVOLUTION_MEM_THRESHOLD"] ?? "85",
);

/** Fetch timeout (ms). */
const FETCH_TIMEOUT_MS = parseInt(
  process.env["EVOLUTION_STABILITY_TIMEOUT_MS"] ?? "5000", 10,
);

// ---------------------------------------------------------------------------
// StabilityCheck
// ---------------------------------------------------------------------------

export class StabilityCheck {
  /**
   * Fetch live metrics from the Supervisor API and evaluate system stability.
   * Returns a StabilityReport.  Errors produce a non-stable report so the
   * evolution engine defers rather than blindly proceeding.
   */
  async check(taskId: string): Promise<StabilityReport> {
    const now = Date.now();
    const ctl  = new AbortController();
    const tid  = setTimeout(() => ctl.abort(), FETCH_TIMEOUT_MS);

    try {
      const res = await fetch(`${SUPERVISOR_URL}/metrics`, {
        signal: ctl.signal,
        headers: { Accept: "application/json" },
      });
      clearTimeout(tid);

      if (!res.ok) {
        return unstable(taskId, `supervisor /metrics returned HTTP ${res.status}`, now);
      }

      // Parse and validate — be defensive about the shape returned.
      const raw = (await res.json()) as unknown;
      if (typeof raw !== "object" || raw === null) {
        return unstable(taskId, "supervisor /metrics returned non-object", now);
      }

      const m = raw as Record<string, unknown>;
      const cpuPct = extractNumber(m, "cpu_pct") ?? extractNumber(m, "cpu") ?? null;
      const memPct = extractNumber(m, "mem_pct") ?? extractNumber(m, "mem") ?? null;

      if (cpuPct === null || memPct === null) {
        return unstable(taskId, "supervisor /metrics missing cpu_pct or mem_pct fields", now);
      }

      const cpuOk = cpuPct < CPU_THRESHOLD;
      const memOk = memPct < MEM_THRESHOLD;
      const stable = cpuOk && memOk;

      let reason: string | undefined;
      if (!stable) {
        const parts: string[] = [];
        if (!cpuOk) parts.push(`CPU ${cpuPct.toFixed(1)}% ≥ threshold ${CPU_THRESHOLD}%`);
        if (!memOk) parts.push(`MEM ${memPct.toFixed(1)}% ≥ threshold ${MEM_THRESHOLD}%`);
        reason = parts.join("; ");
      }

      return { taskId, stable, cpuPct, memPct, reason, checkedAt: now };
    } catch (err) {
      clearTimeout(tid);
      const msg = err instanceof Error ? err.message : String(err);
      return unstable(taskId, `failed to reach supervisor API: ${msg}`, now);
    }
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function unstable(taskId: string, reason: string, checkedAt: number): StabilityReport {
  return { taskId, stable: false, cpuPct: 0, memPct: 0, reason, checkedAt };
}

function extractNumber(obj: Record<string, unknown>, key: string): number | null {
  const v = obj[key];
  if (typeof v === "number" && Number.isFinite(v)) return v;
  return null;
}
