/**
 * GhostBrain — Stability Guard
 *
 * Watchdog that tracks per-resource stability over a rolling window.
 * Resources that repeatedly breach thresholds or experience crash
 * predictions are flagged as "unstable" and quarantined from further
 * automated changes until manual review or proven stability.
 *
 * State:
 *   stable    → no recent critical events
 *   degraded  → 1–2 crit events in window, monitoring intensifies
 *   unstable  → 3+ crit events — auto-recovery is triggered
 *   quarantine → operator intervention required
 */

export type StabilityState = "stable" | "degraded" | "unstable" | "quarantine";

export interface ResourceStability {
  resourceId:   string;
  state:        StabilityState;
  critEvents:   number;   // in rolling window
  lastCritAt:   number;
  quarantineUntil?: number;
  updatedAt:    number;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const WINDOW_MS       = 10 * 60 * 1_000;   // 10-min rolling window
const DEGRADED_AT     = 1;
const UNSTABLE_AT     = 3;
const QUARANTINE_AT   = 6;
const QUARANTINE_MS   = 30 * 60 * 1_000;   // 30 min quarantine

// ── State ─────────────────────────────────────────────────────────────────────

const _resources = new Map<string, ResourceStability>();

function getOrCreate(resourceId: string): ResourceStability {
  const existing = _resources.get(resourceId);
  if (existing) return existing;
  const record: ResourceStability = {
    resourceId,
    state:      "stable",
    critEvents: 0,
    lastCritAt: 0,
    updatedAt:  Date.now(),
  };
  _resources.set(resourceId, record);
  return record;
}

// ── Public API ────────────────────────────────────────────────────────────────

/** Record a critical event for a resource and update its stability state. */
export function recordCritEvent(resourceId: string): ResourceStability {
  const s   = getOrCreate(resourceId);
  const now = Date.now();

  // Expire old events (we track timestamp of lastCrit and count)
  // Simplified: each call increments count; decays if last crit > window
  if (s.lastCritAt > 0 && now - s.lastCritAt > WINDOW_MS) {
    s.critEvents = Math.max(0, s.critEvents - 1);
  }

  s.critEvents++;
  s.lastCritAt = now;
  s.updatedAt  = now;

  if (s.critEvents >= QUARANTINE_AT) {
    s.state           = "quarantine";
    s.quarantineUntil = now + QUARANTINE_MS;
  } else if (s.critEvents >= UNSTABLE_AT) {
    s.state = "unstable";
  } else if (s.critEvents >= DEGRADED_AT) {
    s.state = "degraded";
  }

  return s;
}

/** Record a successful recovery — improve stability score. */
export function recordRecovery(resourceId: string): ResourceStability {
  const s = getOrCreate(resourceId);
  s.critEvents = Math.max(0, s.critEvents - 1);
  s.updatedAt  = Date.now();

  if (s.state === "quarantine" && (s.quarantineUntil ?? 0) < Date.now()) {
    s.state = "unstable";
    delete s.quarantineUntil;
  } else if ((s.state === "unstable" || s.state === "degraded") && s.critEvents < DEGRADED_AT) {
    s.state = "stable";
  } else if (s.state === "unstable" && s.critEvents < UNSTABLE_AT) {
    s.state = "degraded";
  }

  return s;
}

/** Get current stability for a resource (read-only). */
export function getStability(resourceId: string): ResourceStability {
  return getOrCreate(resourceId);
}

/** Get all resources in non-stable state. */
export function getUnstableResources(): ResourceStability[] {
  return [..._resources.values()].filter(s => s.state !== "stable");
}

/** True if the resource is safe to apply auto-recovery actions. */
export function canAutoRecover(resourceId: string): boolean {
  const s = _resources.get(resourceId);
  if (!s) return true;
  if (s.state === "quarantine") {
    if ((s.quarantineUntil ?? 0) > Date.now()) return false;
    // quarantine expired — move to unstable
    s.state = "unstable";
    delete s.quarantineUntil;
  }
  return true;
}

/** Snapshot of all tracked resources. */
export function allStabilities(): ResourceStability[] {
  return [..._resources.values()];
}
