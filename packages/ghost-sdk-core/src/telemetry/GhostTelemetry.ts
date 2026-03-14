// ─────────────────────────────────────────────────────────────────────────────
// GhostTelemetry – Lightweight structured event telemetry
// ─────────────────────────────────────────────────────────────────────────────
import type { GhostTelemetryEvent } from "../types";

export type TelemetrySink = (event: GhostTelemetryEvent) => void | Promise<void>;

export class GhostTelemetry {
  private sinks: TelemetrySink[] = [];
  private buffer: GhostTelemetryEvent[] = [];
  private bufferMax: number;

  constructor(options: { bufferMax?: number } = {}) {
    this.bufferMax = options.bufferMax ?? 500;
  }

  /** Add a sink (e.g. console, HTTP endpoint, Prometheus pushgateway). */
  addSink(sink: TelemetrySink): this {
    this.sinks.push(sink);
    return this;
  }

  /** Emit a telemetry event. Non-blocking – errors in sinks are swallowed. */
  emit(name: string, labels: Record<string, string> = {}, value?: number): void {
    const event: GhostTelemetryEvent = {
      name,
      timestamp: Date.now(),
      labels,
      value
    };
    if (this.buffer.length < this.bufferMax) this.buffer.push(event);
    for (const sink of this.sinks) {
      Promise.resolve(sink(event)).catch(() => {});
    }
  }

  /** Flush and return all buffered events (clears buffer). */
  flush(): GhostTelemetryEvent[] {
    const events = [...this.buffer];
    this.buffer = [];
    return events;
  }

  /** Built-in console sink factory. */
  static consoleSink(): TelemetrySink {
    return (e) => console.log(`[GhostTelemetry] ${e.name}`, e.labels, e.value ?? "");
  }

  /** Built-in HTTP POST sink factory. */
  static httpSink(url: string): TelemetrySink {
    return (e): void => {
      void fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(e)
      }).catch(() => {});
    };
  }
}
