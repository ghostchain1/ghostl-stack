/**
 * GhostBrain — Event Logger
 *
 * Structured event log for all significant GhostBrain OS actions.
 * Stored in a NDJSON ring buffer (in-memory) + optional disk journal.
 *
 * Events are additionally available via WebSocket (/ws path) for
 * real-time dashboard consumption.
 *
 * Categories:
 *   kernel      — brain tick, startup, shutdown
 *   protection  — threshold breach, crash prediction, recovery
 *   orchestrator — load balance, scheduling, container/VM ops
 *   memory      — tier eviction, compaction, hydration
 *   cluster     — peer join/leave, leader election, sync
 *   observability — alert fired, metrics pushed
 */

import { appendFileSync, mkdirSync } from "node:fs";
import { join }                       from "node:path";

// ── Types ─────────────────────────────────────────────────────────────────────

export type EventCategory =
  | "kernel"
  | "protection"
  | "orchestrator"
  | "memory"
  | "cluster"
  | "observability"
  | "infra";

export type EventSeverity = "debug" | "info" | "warn" | "error" | "critical";

export interface BrainEvent {
  id:         string;
  ts:         number;
  category:   EventCategory;
  severity:   EventSeverity;
  action:     string;
  detail:     string;
  resourceId?: string;
  metadata?:  Record<string, unknown>;
}

// ── Configuration ─────────────────────────────────────────────────────────────

const RING_SIZE    = Number(process.env.EVENT_LOG_RING_SIZE   ?? "1000");
const PERSIST_LOG  = process.env.GHOSTBRAIN_MEMORY_DIR
  ? join(process.env.GHOSTBRAIN_MEMORY_DIR, "events.ndjson")
  : null;
const MIN_SEVERITY: EventSeverity = (process.env.EVENT_LOG_MIN_SEVERITY ?? "info") as EventSeverity;

const SEV_ORDER: Record<EventSeverity, number> = {
  debug: 0, info: 1, warn: 2, error: 3, critical: 4,
};

// ── State ─────────────────────────────────────────────────────────────────────

let _seq    = 0;
const _ring: BrainEvent[] = [];
const _listeners: ((ev: BrainEvent) => void)[] = [];

// ── Internal ──────────────────────────────────────────────────────────────────

function meetsMinSeverity(sev: EventSeverity): boolean {
  return SEV_ORDER[sev] >= SEV_ORDER[MIN_SEVERITY];
}

// ── Public API ────────────────────────────────────────────────────────────────

/** Emit a structured event into the log. */
export function emit(ev: Omit<BrainEvent, "id" | "ts">): BrainEvent {
  if (!meetsMinSeverity(ev.severity)) return { id: "", ts: 0, ...ev };

  const full: BrainEvent = {
    id:     `evt-${Date.now()}-${++_seq}`,
    ts:     Date.now(),
    ...ev,
  };

  _ring.push(full);
  if (_ring.length > RING_SIZE) _ring.shift();

  // Persist to disk (best-effort)
  if (PERSIST_LOG) {
    try {
      mkdirSync(process.env.GHOSTBRAIN_MEMORY_DIR!, { recursive: true });
      appendFileSync(PERSIST_LOG, JSON.stringify(full) + "\n");
    } catch { /* non-fatal */ }
  }

  // Broadcast to listeners (WebSocket bridge)
  for (const listener of _listeners) {
    try { listener(full); } catch { /* non-fatal */ }
  }

  return full;
}

/** Convenience wrappers. */
export const log = {
  debug:    (action: string, detail: string, meta?: Omit<BrainEvent, "id"|"ts"|"action"|"detail"|"severity">) =>
    emit({ category: meta?.category ?? "kernel", severity: "debug",    action, detail, ...meta }),
  info:     (action: string, detail: string, meta?: Omit<BrainEvent, "id"|"ts"|"action"|"detail"|"severity">) =>
    emit({ category: meta?.category ?? "kernel", severity: "info",     action, detail, ...meta }),
  warn:     (action: string, detail: string, meta?: Omit<BrainEvent, "id"|"ts"|"action"|"detail"|"severity">) =>
    emit({ category: meta?.category ?? "kernel", severity: "warn",     action, detail, ...meta }),
  error:    (action: string, detail: string, meta?: Omit<BrainEvent, "id"|"ts"|"action"|"detail"|"severity">) =>
    emit({ category: meta?.category ?? "kernel", severity: "error",    action, detail, ...meta }),
  critical: (action: string, detail: string, meta?: Omit<BrainEvent, "id"|"ts"|"action"|"detail"|"severity">) =>
    emit({ category: meta?.category ?? "kernel", severity: "critical", action, detail, ...meta }),
};

/** Subscribe to all events (e.g., WebSocket relay). */
export function subscribe(fn: (ev: BrainEvent) => void): () => void {
  _listeners.push(fn);
  return () => {
    const idx = _listeners.indexOf(fn);
    if (idx >= 0) _listeners.splice(idx, 1);
  };
}

/** Query the in-memory ring. */
export function getEvents(opts: {
  category?:  EventCategory;
  severity?:  EventSeverity;
  limitMs?:   number;
  limit?:     number;
} = {}): BrainEvent[] {
  let evts = [..._ring];
  if (opts.category) evts = evts.filter(e => e.category === opts.category);
  if (opts.severity) evts = evts.filter(e => SEV_ORDER[e.severity] >= SEV_ORDER[opts.severity!]);
  if (opts.limitMs)  evts = evts.filter(e => e.ts >= Date.now() - opts.limitMs!);
  if (opts.limit)    evts = evts.slice(-opts.limit);
  return evts;
}

/** Stats snapshot. */
export function logStats(): { total: number; bySeverity: Record<string, number> } {
  const bySeverity: Record<string, number> = {};
  for (const ev of _ring) {
    bySeverity[ev.severity] = (bySeverity[ev.severity] ?? 0) + 1;
  }
  return { total: _ring.length, bySeverity };
}
