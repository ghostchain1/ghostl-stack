/**
 * GhostBrain Memory Engine — In-Memory Indexer
 *
 * Maintains a fast in-memory index over the loaded record set so pattern
 * detection and filtering don't require re-reading the JSONL file on every
 * supervisor tick.
 *
 * The index is rebuilt from disk on startup and updated incrementally as new
 * records are written. It is NOT persisted — it is always derived from the
 * canonical JSONL store.
 */

import type { MemoryRecord, ReadonlyMemoryRecord, MemoryFilter } from "../models/memory_record.js";
import type { EventCategory } from "../models/system_event.js";

// ---------------------------------------------------------------------------
// Indexer
// ---------------------------------------------------------------------------

export class Indexer {
  /** All records in insertion order. The canonical in-memory copy. */
  private records: MemoryRecord[] = [];

  /**
   * Secondary index: category → sorted array of record positions in `records`.
   * Kept sorted by timestamp ascending.
   */
  private readonly byCategory = new Map<string, number[]>();

  /** Secondary index: source → positions. */
  private readonly bySource   = new Map<string, number[]>();

  // ---------------------------------------------------------------------------
  // Ingestion
  // ---------------------------------------------------------------------------

  /** Bulk-load records from disk on startup. Replaces any existing index state. */
  load(records: MemoryRecord[]): void {
    this.records   = [];
    this.byCategory.clear();
    this.bySource.clear();
    for (const r of records) {
      this.ingest(r);
    }
  }

  /**
   * Add a single new record to the index.
   * Called by MemoryWriter after each successful disk append.
   */
  ingest(record: MemoryRecord): void {
    const pos = this.records.length;
    this.records.push(record);
    this.addToIndex(this.byCategory, record.category, pos);
    this.addToIndex(this.bySource,   record.source,   pos);
  }

  // ---------------------------------------------------------------------------
  // Query
  // ---------------------------------------------------------------------------

  /** Total number of indexed records. */
  get size(): number { return this.records.length; }

  /**
   * Return records matching the given filter.
   * Results are returned newest-first unless `limit` is not set (then oldest-first).
   */
  query(filter: MemoryFilter = {}): ReadonlyMemoryRecord[] {
    const { categories, source, since, until, limit } = filter;

    // Start with the candidate set — use secondary indexes for fast narrowing.
    let candidates: MemoryRecord[];
    if (categories && categories.length === 1 && !source) {
      candidates = this.positionsFor(this.byCategory, categories[0]!).map(
        i => this.records[i]!,
      );
    } else if (!categories?.length && source) {
      candidates = this.positionsFor(this.bySource, source).map(
        i => this.records[i]!,
      );
    } else {
      candidates = [...this.records];
    }

    // Apply remaining filters.
    let result = candidates.filter(r => {
      if (categories?.length && !categories.includes(r.category)) return false;
      if (source && r.source !== source)                           return false;
      if (since  !== undefined && r.timestamp < since)            return false;
      if (until  !== undefined && r.timestamp > until)            return false;
      return true;
    });

    // Newest-first when a limit is requested.
    if (limit !== undefined) {
      result = result.reverse().slice(0, limit);
    }

    return result as ReadonlyMemoryRecord[];
  }

  /**
   * Return counts of events per category within a time window.
   * Used by PatternDetector.
   */
  countByCategory(sinceMs: number, untilMs: number = Date.now()): Map<EventCategory, number> {
    const counts = new Map<EventCategory, number>();
    for (const r of this.records) {
      if (r.timestamp < sinceMs || r.timestamp > untilMs) continue;
      const prev = counts.get(r.category as EventCategory) ?? 0;
      counts.set(r.category as EventCategory, prev + 1);
    }
    return counts;
  }

  /**
   * Return counts of events per source within a time window.
   */
  countBySource(sinceMs: number, untilMs: number = Date.now()): Map<string, number> {
    const counts = new Map<string, number>();
    for (const r of this.records) {
      if (r.timestamp < sinceMs || r.timestamp > untilMs) continue;
      const prev = counts.get(r.source) ?? 0;
      counts.set(r.source, prev + 1);
    }
    return counts;
  }

  /**
   * Return the most recent record for a given category, or undefined.
   */
  latest(category: EventCategory): ReadonlyMemoryRecord | undefined {
    const positions = this.positionsFor(this.byCategory, category);
    if (!positions.length) return undefined;
    return this.records[positions[positions.length - 1]!] as ReadonlyMemoryRecord;
  }

  /** All records in insertion order (read-only). */
  all(): ReadonlyArray<ReadonlyMemoryRecord> {
    return this.records as ReadonlyArray<ReadonlyMemoryRecord>;
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  private addToIndex(index: Map<string, number[]>, key: string, pos: number): void {
    let arr = index.get(key);
    if (!arr) {
      arr = [];
      index.set(key, arr);
    }
    arr.push(pos);
  }

  private positionsFor(index: Map<string, number[]>, key: string): number[] {
    return index.get(key) ?? [];
  }
}
