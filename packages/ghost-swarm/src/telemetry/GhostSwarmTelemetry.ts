/**
 * GhostSwarmTelemetry — lightweight structured telemetry sink for the swarm layer.
 *
 * Records metric observations with timestamps. Callers can subscribe to metric
 * streams via addSink() for forwarding to Prometheus push-gateway, OpenTelemetry,
 * or any other backend.
 */

export interface TelemetryRecord {
  ts: string;
  metric: string;
  value: number | string;
  tags?: Record<string, string>;
}

export type TelemetrySink = (record: TelemetryRecord) => void;

export class GhostSwarmTelemetry {
  private readonly sinks: TelemetrySink[] = [];
  private readonly buffer: TelemetryRecord[] = [];
  private readonly bufferLimit: number;

  constructor(opts: { bufferLimit?: number } = {}) {
    this.bufferLimit = opts.bufferLimit ?? 1_000;
  }

  /** Attach an external sink (e.g. Prometheus push, NATS publisher). */
  addSink(sink: TelemetrySink): void {
    this.sinks.push(sink);
  }

  /** Record a metric observation. */
  record(metric: string, value: number | string, tags?: Record<string, string>): void {
    const entry: TelemetryRecord = { ts: new Date().toISOString(), metric, value, tags };

    console.log(JSON.stringify({ level: 'telemetry', ...entry }));

    if (this.buffer.length >= this.bufferLimit) this.buffer.shift();
    this.buffer.push(entry);

    for (const sink of this.sinks) {
      try { sink(entry); } catch { /* sink errors must not affect the caller */ }
    }
  }

  /** Return recent buffered observations (newest last). */
  recent(n = 100): TelemetryRecord[] {
    return this.buffer.slice(-n);
  }

  /** Return the latest value recorded for a given metric, or undefined. */
  latest(metric: string): TelemetryRecord | undefined {
    for (let i = this.buffer.length - 1; i >= 0; i--) {
      if (this.buffer[i].metric === metric) return this.buffer[i];
    }
    return undefined;
  }

  clear(): void {
    this.buffer.length = 0;
  }
}
