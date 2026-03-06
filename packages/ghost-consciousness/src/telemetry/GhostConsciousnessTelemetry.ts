import type { ConsciousnessTelemetryRecord, TelemetrySeverity } from '../types.js';

export type TelemetrySink = (record: ConsciousnessTelemetryRecord) => void;

/**
 * GhostConsciousnessTelemetry — structured observability for the GCL-Ω.
 *
 * Captures every signal emitted by the Consciousness Layer and routes it to
 * one or more registered sinks (stdout JSON, Prometheus push, Loki stream,
 * OpenTelemetry span, etc.).
 *
 * All records are also stored in an in-memory ring buffer so the
 * ConsciousnessCore can inspect recent signals without external I/O.
 *
 * Severity levels:
 *  debug    — internal state transitions, cycle heartbeats
 *  info     — normal decisions, treaty signings, deliberation outcomes
 *  warn     — unexpected but non-critical conditions
 *  critical — emergency directives, security threats, data integrity issues
 */
export class GhostConsciousnessTelemetry {
  private readonly sinks: TelemetrySink[] = [];
  private readonly buffer: ConsciousnessTelemetryRecord[] = [];
  private readonly bufferMax: number;

  constructor(bufferMax = 1_000) {
    this.bufferMax = bufferMax;
    // Default sink: structured stdout JSON
    this.sinks.push((record) => {
      const { signal, value, severity, layer, timestamp } = record;
      console.log(
        JSON.stringify({ ts: new Date(timestamp).toISOString(), severity, layer, signal, value }),
      );
    });
  }

  /** Emit a telemetry record with an optional severity (default 'info'). */
  record(signal: string, value: unknown, severity: TelemetrySeverity = 'info', layer = 'consciousness'): void {
    const rec: ConsciousnessTelemetryRecord = {
      signal,
      value,
      severity,
      layer,
      timestamp: Date.now(),
    };

    this.buffer.push(rec);
    if (this.buffer.length > this.bufferMax) this.buffer.shift();

    for (const sink of this.sinks) {
      try { sink(rec); } catch { /* sinks must never crash the core */ }
    }
  }

  /** Register an additional telemetry sink. */
  addSink(sink: TelemetrySink): void {
    this.sinks.push(sink);
  }

  /** Retrieve the N most recent records (default 100). */
  recent(limit = 100): ConsciousnessTelemetryRecord[] {
    return this.buffer.slice(-limit).reverse();
  }

  /** Filter buffered records by severity. */
  bySeverity(severity: TelemetrySeverity): ConsciousnessTelemetryRecord[] {
    return this.buffer.filter((r) => r.severity === severity);
  }

  /** Filter buffered records by signal prefix. */
  bySignal(prefix: string): ConsciousnessTelemetryRecord[] {
    return this.buffer.filter((r) => r.signal.startsWith(prefix));
  }

  /** Count records by severity for dashboard widgets. */
  counts(): Record<TelemetrySeverity, number> {
    const result: Record<TelemetrySeverity, number> = { debug: 0, info: 0, warn: 0, critical: 0 };
    for (const r of this.buffer) result[r.severity]++;
    return result;
  }

  get bufferSize(): number {
    return this.buffer.length;
  }
}
