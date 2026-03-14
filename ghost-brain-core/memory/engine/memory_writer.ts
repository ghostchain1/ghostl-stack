/**
 * GhostBrain Memory Engine — Memory Writer
 *
 * Accepts SystemEvents, assigns IDs, signs records with HMAC-SHA256, and
 * appends them to the DiskStore asynchronously. A write queue (sequential
 * async chain) prevents concurrent file appends from racing each other.
 *
 * The writer never calls appendFileSync — the event loop is not blocked.
 */

import { DiskStore, signRecord } from "../storage/disk_store.js";
import { Indexer } from "../storage/indexer.js";
import type { MemoryRecord, MemoryRecordPayload } from "../models/memory_record.js";
import type { EventCategory, SystemEvent } from "../models/system_event.js";

// ---------------------------------------------------------------------------
// MemoryWriter
// ---------------------------------------------------------------------------

export class MemoryWriter {
  private idCounter = 0;
  private writeQueue: Promise<void> = Promise.resolve();

  constructor(
    private readonly store: DiskStore,
    private readonly indexer: Indexer,
  ) {}

  /**
   * Enqueue a write for a SystemEvent.
   * Returns the assigned record ID immediately (the write completes async).
   * Never throws synchronously — any disk error is logged and swallowed so the
   * supervisor loop continues running.
   */
  write<C extends EventCategory>(event: SystemEvent<C>): number {
    const id = ++this.idCounter;
    const timestamp = Date.now();

    const payload: MemoryRecordPayload<C> = {
      id,
      timestamp,
      category: event.category,
      source: event.source,
      data: event.data,
    };

    const hmac = signRecord(payload);
    const record: MemoryRecord<C> = { ...payload, hmac };

    // Chain onto the write queue so appends are sequential.
    this.writeQueue = this.writeQueue.then(async () => {
      try {
        await this.store.append(record as MemoryRecord);
        this.indexer.ingest(record as MemoryRecord);
      } catch (err) {
        console.error("[MemoryWriter] Failed to persist record", id, err);
      }
    });

    return id;
  }

  /**
   * Wait until all currently enqueued writes have been flushed to disk.
   * Useful for graceful shutdown.
   */
  async flush(): Promise<void> {
    await this.writeQueue;
  }

  /** Number of records written since process start. */
  get recordsWritten(): number { return this.idCounter; }
}
