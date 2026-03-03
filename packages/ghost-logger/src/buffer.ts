// buffer.ts — Async ring buffer for log entries
// SPDX-License-Identifier: MIT
//
// Decouples log call-sites from I/O (NATS publish / file write).
// Falls back to stdout when the buffer is full (back-pressure safety valve).

import type { GhostLogEntry } from './types.js';

type FlushFn = (entries: GhostLogEntry[]) => Promise<void>;

export class LogBuffer {
  private readonly buf:     GhostLogEntry[];
  private readonly max:     number;
  private readonly flush:   FlushFn;
  private readonly flushMs: number;
  private timer:            ReturnType<typeof setInterval> | null = null;
  private draining = false;

  /**
   * @param maxSize    Maximum held entries before sync flush
   * @param flushMs    Flush interval in milliseconds
   * @param flushFn    Async function called with the batch to persist/publish
   */
  constructor(maxSize: number, flushMs: number, flushFn: FlushFn) {
    this.buf     = [];
    this.max     = maxSize;
    this.flush   = flushFn;
    this.flushMs = flushMs;
  }

  /** Start the periodic flush timer */
  start(): void {
    if (this.timer) return;
    this.timer = setInterval(() => void this._flush(), this.flushMs);
    if (this.timer.unref) this.timer.unref(); // Don't block process exit
  }

  /** Stop the timer */
  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  /** Push an entry into the buffer */
  push(entry: GhostLogEntry): void {
    if (this.draining) {
      // During drain, write directly
      process.stdout.write(JSON.stringify(entry) + '\n');
      return;
    }
    this.buf.push(entry);
    if (this.buf.length >= this.max) {
      void this._flush();
    }
  }

  /** Drain all buffered entries (call on graceful shutdown) */
  async drain(): Promise<void> {
    this.draining = true;
    this.stop();
    await this._flush();
  }

  get size(): number { return this.buf.length; }

  private async _flush(): Promise<void> {
    if (this.buf.length === 0) return;
    const batch = this.buf.splice(0, this.buf.length);
    try {
      await this.flush(batch);
    } catch {
      // Fallback: write to stdout so logs are never fully lost
      for (const e of batch) {
        process.stdout.write(JSON.stringify(e) + '\n');
      }
    }
  }
}
