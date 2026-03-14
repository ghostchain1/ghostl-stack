/**
 * GhostBrain Memory Engine — Memory Reader
 *
 * Provides query and analytics access to the indexed record set.
 * All reads go through the Indexer (in-memory); no disk I/O during queries.
 * Disk reads happen only during the initial load at startup.
 */

import { Indexer } from "../storage/indexer.js";
import type { ReadonlyMemoryRecord, MemoryFilter } from "../models/memory_record.js";
import type { EventCategory } from "../models/system_event.js";

// ---------------------------------------------------------------------------
// MemoryReader
// ---------------------------------------------------------------------------

export class MemoryReader {
  constructor(private readonly indexer: Indexer) {}

  // ---------------------------------------------------------------------------
  // Basic queries
  // ---------------------------------------------------------------------------

  /**
   * Query records with optional filtering.
   * - Filter by category, source, time range, or result count.
   * - Returns newest-first when `limit` is set, oldest-first otherwise.
   */
  query(filter: MemoryFilter = {}): ReadonlyMemoryRecord[] {
    return this.indexer.query(filter);
  }

  /**
   * Return all records with the given category, optionally limited to the
   * most recent `n` entries. Newest first.
   */
  recent(category: EventCategory, n: number = 50): ReadonlyMemoryRecord[] {
    return this.indexer.query({ categories: [category], limit: n });
  }

  /**
   * Most recent record for a category, or undefined if none exists.
   */
  latest(category: EventCategory): ReadonlyMemoryRecord | undefined {
    return this.indexer.latest(category);
  }

  /** Total number of records in the index. */
  get totalRecords(): number { return this.indexer.size; }

  // ---------------------------------------------------------------------------
  // Time-windowed analytics (used by learning layer)
  // ---------------------------------------------------------------------------

  /**
   * Count events per category within the last `windowMs` milliseconds.
   * Returns a plain object sorted by count descending.
   */
  frequencyMap(windowMs: number): Array<{ category: EventCategory; count: number }> {
    const since = Date.now() - windowMs;
    const counts = this.indexer.countByCategory(since);
    return Array.from(counts.entries())
      .map(([category, count]) => ({ category, count }))
      .sort((a, b) => b.count - a.count);
  }

  /**
   * Count events per source within the last `windowMs` milliseconds.
   */
  sourceFrequencyMap(windowMs: number): Array<{ source: string; count: number }> {
    const since = Date.now() - windowMs;
    const counts = this.indexer.countBySource(since);
    return Array.from(counts.entries())
      .map(([source, count]) => ({ source, count }))
      .sort((a, b) => b.count - a.count);
  }

  /**
   * Return records in a time range (inclusive both ends).
   */
  between(sinceMs: number, untilMs: number): ReadonlyMemoryRecord[] {
    return this.indexer.query({ since: sinceMs, until: untilMs });
  }

  /**
   * Group recent records by hour of day (0–23) for a given category.
   * Useful for detecting time-of-day failure patterns (e.g. "crashes at 3 am").
   * Returns counts for the last `lookbackMs` milliseconds.
   */
  hourlyDistribution(
    category: EventCategory,
    lookbackMs: number = 7 * 24 * 60 * 60 * 1_000,
  ): Map<number, number> {
    const since = Date.now() - lookbackMs;
    const records = this.indexer.query({ categories: [category], since });
    const dist = new Map<number, number>();
    for (const r of records) {
      const hour = new Date(r.timestamp).getUTCHours();
      dist.set(hour, (dist.get(hour) ?? 0) + 1);
    }
    return dist;
  }

  /**
   * Identify the hour of day with the highest event frequency for a category.
   * Returns null if fewer than 2 data points exist.
   */
  peakHour(category: EventCategory): { hour: number; count: number } | null {
    const dist = this.hourlyDistribution(category);
    if (dist.size < 2) return null;
    let peak = { hour: 0, count: 0 };
    for (const [hour, count] of dist) {
      if (count > peak.count) peak = { hour, count };
    }
    return peak;
  }
}
