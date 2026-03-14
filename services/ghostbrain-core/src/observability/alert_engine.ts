/**
 * GhostBrain — Alert Engine
 *
 * Rule-based alerting. Each rule is a named condition evaluated against
 * a shared metric snapshot on every brain tick. When a rule fires,
 * the alert is stored (deduplicated) and emitted to configured sinks:
 *   - in-process event log (always)
 *   - optional webhook (ALERT_WEBHOOK_URL)
 *   - optional Loki push (LOKI_URL)
 */

import { request }   from "undici";

const WEBHOOK_URL = process.env.ALERT_WEBHOOK_URL ?? "";
const LOKI_URL    = process.env.LOKI_URL          ?? "";

// ── Types ─────────────────────────────────────────────────────────────────────

export type AlertSeverity = "info" | "warn" | "crit" | "emergency";

export interface AlertContext {
  cpuPercent:      number;
  memPercent:      number;
  diskPercent:     number;
  queueDepth:      number;
  unstableCount:   number;
  crashRiskHigh:   number;    // count of resources with risk >= "high"
}

export interface AlertRule {
  name:      string;
  severity:  AlertSeverity;
  condition: (ctx: AlertContext) => boolean;
  message:   (ctx: AlertContext) => string;
}

export interface FiredAlert {
  rule:       string;
  severity:   AlertSeverity;
  message:    string;
  firedAt:    number;
  resolvedAt: number | null;
}

// ── Built-in rules ────────────────────────────────────────────────────────────

const DEFAULT_RULES: AlertRule[] = [
  {
    name:      "cpu_critical",
    severity:  "crit",
    condition: ctx => ctx.cpuPercent >= 90,
    message:   ctx => `CPU at ${ctx.cpuPercent.toFixed(1)}% — exceeds critical threshold`,
  },
  {
    name:      "memory_critical",
    severity:  "crit",
    condition: ctx => ctx.memPercent >= 92,
    message:   ctx => `Memory at ${ctx.memPercent.toFixed(1)}% — OOM risk`,
  },
  {
    name:      "disk_pressure",
    severity:  "warn",
    condition: ctx => ctx.diskPercent >= 80,
    message:   ctx => `Disk at ${ctx.diskPercent.toFixed(1)}% — expand volume or clean up`,
  },
  {
    name:      "scheduler_overloaded",
    severity:  "warn",
    condition: ctx => ctx.queueDepth > 50,
    message:   ctx => `Job queue depth ${ctx.queueDepth} — scheduler may be lagging`,
  },
  {
    name:      "multiple_unstable_resources",
    severity:  "crit",
    condition: ctx => ctx.unstableCount >= 3,
    message:   ctx => `${ctx.unstableCount} resources in unstable state — cluster health degraded`,
  },
  {
    name:      "imminent_crash_risk",
    severity:  "emergency",
    condition: ctx => ctx.crashRiskHigh >= 2,
    message:   ctx => `${ctx.crashRiskHigh} resources with high/imminent crash risk`,
  },
];

// ── State ─────────────────────────────────────────────────────────────────────

const _rules = new Map<string, AlertRule>(DEFAULT_RULES.map(r => [r.name, r]));
const _fired = new Map<string, FiredAlert>();

// ── Evaluation ────────────────────────────────────────────────────────────────

/** Register a custom alert rule. */
export function addRule(rule: AlertRule): void {
  _rules.set(rule.name, rule);
}

/**
 * Evaluate all rules against the current context.
 * Returns newly fired alerts (transitions from 0 → 1).
 */
export function evaluate(ctx: AlertContext): FiredAlert[] {
  const now      = Date.now();
  const newAlerts: FiredAlert[] = [];

  for (const [name, rule] of _rules) {
    const fires = rule.condition(ctx);
    const existing = _fired.get(name);

    if (fires && !existing) {
      const alert: FiredAlert = {
        rule:       name,
        severity:   rule.severity,
        message:    rule.message(ctx),
        firedAt:    now,
        resolvedAt: null,
      };
      _fired.set(name, alert);
      newAlerts.push(alert);
      void emitAlert(alert);
    } else if (!fires && existing && existing.resolvedAt === null) {
      existing.resolvedAt = now;
    }
  }

  return newAlerts;
}

/** Return all currently active (unresolved) alerts. */
export function activeAlerts(): FiredAlert[] {
  return [..._fired.values()].filter(a => a.resolvedAt === null);
}

/** Return full alert history. */
export function allAlerts(): FiredAlert[] {
  return [..._fired.values()];
}

// ── Sinks ─────────────────────────────────────────────────────────────────────

async function emitAlert(alert: FiredAlert): Promise<void> {
  // Webhook
  if (WEBHOOK_URL) {
    try {
      await request(WEBHOOK_URL, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify(alert),
        bodyTimeout: 5_000,
      });
    } catch { /* non-fatal */ }
  }

  // Loki push
  if (LOKI_URL) {
    const payload = {
      streams: [{
        stream: { service: "ghostbrain-core", severity: alert.severity },
        values: [[String(alert.firedAt * 1_000_000), JSON.stringify(alert)]],
      }],
    };
    try {
      await request(`${LOKI_URL}/loki/api/v1/push`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify(payload),
        bodyTimeout: 5_000,
      });
    } catch { /* non-fatal */ }
  }
}
