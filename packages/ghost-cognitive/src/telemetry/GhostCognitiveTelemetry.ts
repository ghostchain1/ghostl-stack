/**
 * GhostCognitiveTelemetry — structured telemetry sink for the cognitive layer.
 *
 * Emits timestamped JSON records for every cognitive decision or learning event,
 * making the AI reasoning fully auditable.
 */

export interface CognitiveRecord {
  ts: string;
  layer: 'cognitive';
  event: string;
  data: Record<string, unknown>;
}

export type CognitiveSink = (record: CognitiveRecord) => void;

export class GhostCognitiveTelemetry {
  private readonly sinks: CognitiveSink[] = [];
  private readonly buffer: CognitiveRecord[] = [];
  private readonly bufferLimit: number;

  constructor(opts: { bufferLimit?: number } = {}) {
    this.bufferLimit = opts.bufferLimit ?? 500;
  }

  addSink(sink: CognitiveSink): void {
    this.sinks.push(sink);
  }

  record(event: string, data: Record<string, unknown> = {}): void {
    const entry: CognitiveRecord = {
      ts: new Date().toISOString(),
      layer: 'cognitive',
      event,
      data,
    };

    console.log(JSON.stringify(entry));

    if (this.buffer.length >= this.bufferLimit) this.buffer.shift();
    this.buffer.push(entry);

    for (const sink of this.sinks) {
      try { sink(entry); } catch { /* non-fatal */ }
    }
  }

  recent(n = 50): CognitiveRecord[] {
    return this.buffer.slice(-n);
  }

  clear(): void {
    this.buffer.length = 0;
  }
}
