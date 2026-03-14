import { Logger } from "@ghostchain/devkit";

const log = Logger.create("Telemetry");

export interface MetricRecord {
  metric: string;
  value: number;
  timestamp: string;
}

export class GhostTelemetry {
  private readonly records: MetricRecord[] = [];

  record(metric: string, value: number): void {
    const entry: MetricRecord = { metric, value, timestamp: new Date().toISOString() };
    this.records.push(entry);
    log.debug(`[telemetry] ${metric}=${value}`);
  }

  latest(metric: string): number | undefined {
    const entries = this.records.filter((r) => r.metric === metric);
    return entries.at(-1)?.value;
  }

  history(metric: string): MetricRecord[] {
    return this.records.filter((r) => r.metric === metric);
  }

  dump(): MetricRecord[] {
    return [...this.records];
  }

  clear(): void {
    this.records.length = 0;
  }
}
