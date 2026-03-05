import { randomUUID } from 'node:crypto';
import type { MemoryEntry } from '../types.js';

/**
 * GhostMemoryStore — persistent in-process episodic memory for the cognitive layer.
 *
 * Stores timestamped event records across domains: network metrics, validator
 * performance, market prices, governance outcomes, and security incidents.
 * A capacity cap with LRU eviction prevents unbounded growth.
 */
export class GhostMemoryStore {
  private readonly memory: MemoryEntry[] = [];
  private readonly capacity: number;

  constructor(opts: { capacity?: number } = {}) {
    this.capacity = opts.capacity ?? 10_000;
  }

  /** Store an entry, evicting the oldest if capacity is exceeded. */
  store<T = unknown>(category: string, data: T, tags?: string[]): MemoryEntry<T> {
    const entry: MemoryEntry<T> = {
      id: randomUUID(),
      timestamp: Date.now(),
      category,
      data,
      tags,
    };
    if (this.memory.length >= this.capacity) {
      this.memory.shift(); // evict oldest
    }
    this.memory.push(entry);
    return entry;
  }

  /** Query entries using a predicate function. */
  query<T = unknown>(filter: (e: MemoryEntry) => boolean): MemoryEntry<T>[] {
    return this.memory.filter(filter) as MemoryEntry<T>[];
  }

  /** Return all entries in a given category. */
  byCategory<T = unknown>(category: string): MemoryEntry<T>[] {
    return this.query<T>(e => e.category === category);
  }

  /** Return the N most recent entries. */
  recent<T = unknown>(n = 100): MemoryEntry<T>[] {
    return this.memory.slice(-n) as MemoryEntry<T>[];
  }

  /** Return the most recent entry for a category. */
  latestOf<T = unknown>(category: string): MemoryEntry<T> | undefined {
    for (let i = this.memory.length - 1; i >= 0; i--) {
      if (this.memory[i].category === category) return this.memory[i] as MemoryEntry<T>;
    }
    return undefined;
  }

  size(): number {
    return this.memory.length;
  }

  clear(): void {
    this.memory.length = 0;
  }
}
