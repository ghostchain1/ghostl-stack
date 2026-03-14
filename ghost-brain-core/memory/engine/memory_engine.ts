/**
 * GhostBrain Memory Engine — Core
 *
 * The central façade for the memory subsystem.
 *
 *   GhostMemoryEngine
 *     ├── DiskStore      — JSONL persistence (HMAC-signed records)
 *     ├── Indexer        — In-memory index rebuilt from disk at startup
 *     ├── MemoryWriter   — Async enqueue → sign → append → index
 *     └── MemoryReader   — Query / analytics interface
 *
 * Usage (from supervisor or any other module):
 *
 *   const mem = new GhostMemoryEngine();
 *   await mem.init();           // Load history from disk into index
 *
 *   mem.remember({              // Non-blocking write
 *     category: "docker_failure",
 *     source: "docker_controller",
 *     data: { containerName: "ghostl3-validator", reason: "OOM" },
 *   });
 *
 *   const freq = mem.reader.frequencyMap(60 * 60_000); // last hour
 */

import { DiskStore } from "../storage/disk_store.js";
import { Indexer } from "../storage/indexer.js";
import { MemoryWriter } from "./memory_writer.js";
import { MemoryReader } from "./memory_reader.js";
import type { EventCategory, SystemEvent } from "../models/system_event.js";

// ---------------------------------------------------------------------------
// GhostMemoryEngine
// ---------------------------------------------------------------------------

export class GhostMemoryEngine {
  readonly store:   DiskStore;
  readonly indexer: Indexer;
  readonly writer:  MemoryWriter;
  readonly reader:  MemoryReader;

  private initialised = false;

  constructor(memoryPath?: string) {
    this.store   = new DiskStore(memoryPath);
    this.indexer = new Indexer();
    this.writer  = new MemoryWriter(this.store, this.indexer);
    this.reader  = new MemoryReader(this.indexer);
  }

  /**
   * Load existing records from disk into the in-memory index.
   * Must be called once before the supervisor loop starts.
   * Idempotent — safe to call again after a soft restart signal.
   */
  async init(): Promise<void> {
    const records = await this.store.readAll();
    this.indexer.load(records);
    this.initialised = true;

    const sizeBytes = await this.store.sizeBytes();
    console.log(
      `[GhostMemoryEngine] Initialised — loaded ${records.length} records` +
      ` (${(sizeBytes / 1024).toFixed(1)} KB) from ${this.store.path}`,
    );
  }

  /**
   * Persist a SystemEvent to disk and add it to the live index.
   * Non-blocking — enqueues the write and returns immediately.
   * Returns the assigned record ID.
   *
   * Safe to call before init() — writes are queued and will succeed as long
   * as the directory is writable.
   */
  remember<C extends EventCategory>(event: SystemEvent<C>): number {
    return this.writer.write(event);
  }

  /**
   * Convenience: record an event with only category + source + data (no boilerplate).
   */
  record<C extends EventCategory>(
    category: C,
    source: string,
    data: SystemEvent<C>["data"],
  ): number {
    return this.remember({ category, source, data } as SystemEvent<C>);
  }

  /**
   * Flush all pending writes to disk. Call during graceful shutdown.
   */
  async flush(): Promise<void> {
    await this.writer.flush();
  }

  /** Whether init() has been called. */
  get isReady(): boolean { return this.initialised; }

  /** Shorthand: total records stored in the index. */
  get size(): number { return this.indexer.size; }
}
