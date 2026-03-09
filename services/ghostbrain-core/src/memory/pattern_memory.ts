/**
 * GhostBrain Core — Pattern Memory
 *
 * Detects recurring event correlations inside a sliding 5-minute window.
 * When event A consistently precedes event B across resources, it creates
 * a pattern entry that the crash predictor can use for early warning.
 *
 * Storage: in-memory ring + optional NDJSON flush on shutdown.
 */

import { appendFileSync, mkdirSync, readFileSync, existsSync } from "node:fs";
import { join }  from "node:path";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface RawEvent {
  resourceId: string;
  label:      string;   // e.g. "cpu_high", "oom_kill", "restart"
  category:   string;   // e.g. "vm", "container", "chain"
  ts:         number;   // ms
}

export interface PatternEntry {
  precursor: string;    // "category:label" of triggering event
  consequent: string;  // "category:label" of following event
  count:     number;
  confidence: number;  // count / total precursor occurrences
  avgDelayMs: number;
  lastSeenMs: number;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const WINDOW_MS   = 5 * 60 * 1_000;  // 5-minute co-occurrence window
const MIN_COUNT   = 3;                // patterns need ≥3 occurrences
const MAX_RING    = 2_000;

// ── State ─────────────────────────────────────────────────────────────────────

const _ring: RawEvent[]                              = [];
const _coTable = new Map<string, { count: number; totalDelayMs: number; lastSeen: number }>();
const _precursorCount = new Map<string, number>();

let MEMORY_DIR = process.env.GHOSTBRAIN_MEMORY_DIR ?? "/tmp/ghostbrain-memory";
let PATTERN_FILE = join(MEMORY_DIR, "patterns.ndjson");

// ── Internal ──────────────────────────────────────────────────────────────────

function key(precursor: string, consequent: string): string {
  return `${precursor}|||${consequent}`;
}

function ekey(ev: RawEvent): string {
  return `${ev.category}:${ev.label}`;
}

// ── Public API ────────────────────────────────────────────────────────────────

/** Record a new infrastructure event and update co-occurrence table. */
export function recordEvent(ev: RawEvent): void {
  // expire old entries
  const cutoff = ev.ts - WINDOW_MS;
  while (_ring.length > 0 && _ring[0]!.ts < cutoff) _ring.shift();

  const evKey = ekey(ev);
  // For each event in the window that preceded this one, record co-occurrence
  for (const prev of _ring) {
    const delay = ev.ts - prev.ts;
    if (delay <= 0) continue;
    const pk  = ekey(prev);
    const ck  = key(pk, evKey);
    const entry = _coTable.get(ck) ?? { count: 0, totalDelayMs: 0, lastSeen: 0 };
    entry.count++;
    entry.totalDelayMs += delay;
    entry.lastSeen = ev.ts;
    _coTable.set(ck, entry);
    _precursorCount.set(pk, (_precursorCount.get(pk) ?? 0) + 1);
  }

  _ring.push(ev);
  if (_ring.length > MAX_RING) _ring.shift();
}

/** Return all patterns meeting the minimum confidence threshold. */
export function detectPatterns(minConfidence = 0.35): PatternEntry[] {
  const out: PatternEntry[] = [];
  for (const [k, v] of _coTable) {
    if (v.count < MIN_COUNT) continue;
    const [precursor, consequent] = k.split("|||") as [string, string];
    const totalPre = _precursorCount.get(precursor) ?? 1;
    const confidence = v.count / totalPre;
    if (confidence < minConfidence) continue;
    out.push({
      precursor,
      consequent,
      count:      v.count,
      confidence,
      avgDelayMs: Math.round(v.totalDelayMs / v.count),
      lastSeenMs: v.lastSeen,
    });
  }
  return out.sort((a, b) => b.confidence - a.confidence);
}

/** Return stats for the observability dashboard. */
export function patternStats(): { ringSize: number; patterns: number; precursors: number } {
  return {
    ringSize:   _ring.length,
    patterns:   _coTable.size,
    precursors: _precursorCount.size,
  };
}

/** Persist ring to disk (called on shutdown / periodic flush). */
export function flushPatterns(): void {
  mkdirSync(MEMORY_DIR, { recursive: true });
  try {
    for (const ev of _ring) {
      appendFileSync(PATTERN_FILE, JSON.stringify(ev) + "\n");
    }
  } catch { /* best-effort */ }
}

/** Hydrate ring from disk on startup. */
export function hydratePatternMemory(dir?: string): void {
  if (dir) { MEMORY_DIR = dir; PATTERN_FILE = join(dir, "patterns.ndjson"); }
  mkdirSync(MEMORY_DIR, { recursive: true });
  if (!existsSync(PATTERN_FILE)) return;
  try {
    const lines = readFileSync(PATTERN_FILE, "utf8").split("\n").filter(Boolean);
    const cutoff = Date.now() - WINDOW_MS * 12; // keep last hour
    for (const line of lines) {
      try {
        const ev = JSON.parse(line) as RawEvent;
        if (ev.ts >= cutoff) recordEvent(ev);
      } catch { /* skip corrupt lines */ }
    }
  } catch { /* best-effort */ }
}
