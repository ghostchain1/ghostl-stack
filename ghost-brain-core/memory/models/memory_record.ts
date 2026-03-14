/**
 * GhostBrain Memory Engine — Memory Record Model
 *
 * Every persisted record is a MemoryRecord. Records are HMAC-SHA256 signed
 * at write time so replayed or corrupted log lines can be detected at read time.
 */

import type { EventCategory, SystemEvent } from "./system_event.js";

// ---------------------------------------------------------------------------
// Core record type
// ---------------------------------------------------------------------------

/**
 * A persisted memory record. One JSON object per line in the JSONL store.
 *
 * Fields:
 *  - id         — monotonic counter assigned by the writer (per-process)
 *  - timestamp  — Unix epoch milliseconds (Date.now())
 *  - category   — event category, drives pattern detection
 *  - source     — controller / module that emitted the event
 *  - data       — structured payload (typed per category in system_event.ts)
 *  - hmac       — HMAC-SHA256 over JSON(id+timestamp+category+source+data)
 *                 keyed with GHOSTBRAIN_MEMORY_SECRET. Empty string when the
 *                 env var is unset (record is valid but unverified).
 */
export interface MemoryRecord<C extends EventCategory = EventCategory> {
  id: number;
  timestamp: number;
  category: C;
  source: string;
  data: SystemEvent<C>["data"];
  hmac: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Fields that are included in the HMAC digest (everything except `hmac` itself). */
export type MemoryRecordPayload<C extends EventCategory = EventCategory> =
  Omit<MemoryRecord<C>, "hmac">;

/** Read-only view returned by the reader & engine. */
export type ReadonlyMemoryRecord<C extends EventCategory = EventCategory> =
  Readonly<MemoryRecord<C>>;

// ---------------------------------------------------------------------------
// Filter / query types used by MemoryReader
// ---------------------------------------------------------------------------

export interface MemoryFilter {
  /** Limit results to these categories. Empty array = all categories. */
  categories?: EventCategory[];
  /** Limit results to events from this source. Omit for all sources. */
  source?: string;
  /** Lower bound (inclusive), Unix epoch ms. */
  since?: number;
  /** Upper bound (inclusive), Unix epoch ms. */
  until?: number;
  /** Return at most this many records (most recent first). */
  limit?: number;
}
