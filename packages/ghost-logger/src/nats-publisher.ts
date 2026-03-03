// nats-publisher.ts — NATS pub to ghost-secure-logger aggregator
// SPDX-License-Identifier: MIT
//
// Subject schema:
//   ghostlog.ingest.<service>   — individual entries
//   ghostlog.bundle.<service>   — signed bundles (from buffer flush)

import { connect, type NatsConnection, StringCodec } from 'nats';
import type { GhostLogEntry, GhostLogEnvelope } from './types.js';

const sc = StringCodec();

export class NatsPublisher {
  private nc:      NatsConnection | null = null;
  private service: string;
  private url:     string;
  private _ready = false;

  constructor(natsUrl: string, service: string) {
    this.url     = natsUrl;
    this.service = service;
  }

  async connect(): Promise<void> {
    try {
      this.nc = await connect({
        servers: [this.url],
        name: `ghost-logger-${this.service}`,
        maxReconnectAttempts: -1,     // Reconnect indefinitely
        reconnectTimeWait:    2000,
        pingInterval:         30_000,
      });
      this._ready = true;
      // Register closed handler
      void this.nc.closed().then(() => { this._ready = false; });
    } catch {
      this._ready = false;
      // Silent fail — logger should not crash the host process
    }
  }

  get ready(): boolean { return this._ready && this.nc !== null; }

  /** Publish a single entry; silently drops if NATS is unavailable */
  publishEntry(entry: GhostLogEntry): void {
    if (!this.ready || !this.nc) return;
    const envelope: GhostLogEnvelope = {
      v:            1,
      entry,
      origin:       entry.origin,
      published_at: new Date().toISOString(),
    };
    try {
      this.nc.publish(
        `ghostlog.ingest.${this.service}`,
        sc.encode(JSON.stringify(envelope)),
      );
    } catch {
      // Silent fail
    }
  }

  /** Publish a batch of entries as individual messages */
  publishBatch(entries: GhostLogEntry[]): void {
    for (const e of entries) this.publishEntry(e);
  }

  /** Drain and close the NATS connection */
  async drain(): Promise<void> {
    if (this.nc && this._ready) {
      try {
        await this.nc.drain();
      } catch {
        // ignore
      }
    }
    this._ready = false;
    this.nc = null;
  }
}
