/**
 * GhostBrainTelemetry
 *
 * Structured, batched telemetry reporter for GhostStack operational metrics.
 *
 * Aggregates three categories of signals:
 *   - Gas/block metrics (per layer)
 *   - Validator/RPC health snapshots
 *   - Bridge queue and finality metrics
 *
 * Queues events locally and flushes on interval or when batch is full.
 *
 * Usage:
 *   const telem = new GhostBrainTelemetry({ client: brainClient });
 *   telem.recordGas({ layer: "L2", baseFee: 1000n, gasUsed: 21000n, txCount: 3 });
 *   telem.start();           // starts auto-flush every 10s
 *   await telem.flush();     // manual flush
 *   telem.stop();
 */

import { GhostBrainClient, BrainTelemetry } from "./GhostBrainClient.js";

// ── Data types ────────────────────────────────────────────────────────────────

export interface GasMetric {
  layer:    string;
  baseFee:  bigint | string;
  gasUsed:  bigint | string;
  txCount?: number;
}

export interface ValidatorMetric {
  layer:       string;
  rpcUrl:      string;
  latencyMs:   number;
  blockNumber: number;
  peerCount:   number;
  syncing:     boolean;
}

export interface BridgeMetric {
  fromLayer:    string;
  toLayer:      string;
  queueSize:    number;  // number of pending cross-chain messages
  avgDelayMs?:  number;  // average observed finality delay
}

export interface GhostBrainTelemetryConfig {
  /** GhostBrainClient instance or endpoint string */
  client:     GhostBrainClient | string;
  /** Maximum queue size before forced flush. Default 50 */
  batchSize?: number;
  /** Auto-flush interval in ms. 0 = disabled. Default 10_000 */
  flushIntervalMs?: number;
  /** Max retries per failed flush.  Default 2 */
  maxRetries?: number;
}

// ── GhostBrainTelemetry ───────────────────────────────────────────────────────

export class GhostBrainTelemetry {
  private readonly client:    GhostBrainClient;
  private readonly batchSize: number;
  private readonly flushIntervalMs: number;
  private readonly maxRetries: number;

  private queue:   BrainTelemetry[] = [];
  private timer:   ReturnType<typeof setInterval> | null = null;
  private flushing = false;

  constructor(config: GhostBrainTelemetryConfig) {
    this.client = typeof config.client === "string"
      ? new GhostBrainClient(config.client)
      : config.client;
    this.batchSize       = config.batchSize       ?? 50;
    this.flushIntervalMs = config.flushIntervalMs ?? 10_000;
    this.maxRetries      = config.maxRetries      ?? 2;
  }

  // ── Public API ────────────────────────────────────────────────────────────

  /** Record a gas / block metric event. */
  recordGas(m: GasMetric): void {
    this._enqueue({
      layer:   m.layer,
      baseFee: m.baseFee.toString(),
      gasUsed: m.gasUsed.toString(),
      meta:    m.txCount != null ? { txCount: m.txCount } : undefined,
    });
  }

  /** Record a validator / RPC health snapshot. */
  recordValidator(m: ValidatorMetric): void {
    this._enqueue({
      layer:   m.layer,
      meta: {
        rpcUrl:      m.rpcUrl,
        latencyMs:   m.latencyMs,
        blockNumber: m.blockNumber,
        peerCount:   m.peerCount,
        syncing:     m.syncing,
        event:       "validator-health",
      },
    });
  }

  /** Record a bridge queue / finality metric. */
  recordBridge(m: BridgeMetric): void {
    this._enqueue({
      bridgeLoad: m.queueSize,
      meta: {
        fromLayer:    m.fromLayer,
        toLayer:      m.toLayer,
        event:        "bridge-metric",
        ...(m.avgDelayMs != null ? { avgDelayMs: m.avgDelayMs } : {}),
      },
    });
  }

  /** Start automatic flushing on interval. */
  start(): void {
    if (this.timer || this.flushIntervalMs <= 0) return;
    this.timer = setInterval(() => void this.flush(), this.flushIntervalMs);
  }

  /** Stop automatic flushing. */
  stop(): void {
    if (this.timer) { clearInterval(this.timer); this.timer = null; }
  }

  /** Number of events waiting in the local queue. */
  get queueLength(): number { return this.queue.length; }

  /**
   * Flush all queued events to GhostBrain Core.
   * If offline, events are discarded after maxRetries to avoid unbounded growth.
   */
  async flush(): Promise<void> {
    if (this.flushing || this.queue.length === 0) return;
    this.flushing = true;

    const batch = this.queue.splice(0, this.queue.length);
    let attempt = 0;

    while (attempt <= this.maxRetries) {
      const failures: BrainTelemetry[] = [];

      await Promise.allSettled(batch.map(async (event) => {
        try {
          await this.client.reportTelemetry(event);
        } catch {
          failures.push(event);
        }
      }));

      if (failures.length === 0) break;

      attempt++;
      if (attempt > this.maxRetries) {
        // Discard to avoid memory leak — GhostBrain is offline
        break;
      }
      // Re-enqueue failures for next attempt
      batch.length = 0;
      batch.push(...failures);
      await _sleep(500 * attempt);
    }

    this.flushing = false;
  }

  // ── Internal ──────────────────────────────────────────────────────────────

  private _enqueue(item: BrainTelemetry): void {
    this.queue.push(item);
    if (this.queue.length >= this.batchSize) {
      void this.flush();
    }
  }
}

function _sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
