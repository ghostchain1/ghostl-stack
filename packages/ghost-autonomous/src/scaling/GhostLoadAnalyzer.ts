import { Logger } from "@ghostchain/devkit";

const log = Logger.create("LoadAnalyzer");

export interface LoadMetrics {
  cpu: number;
  mem: number;
  txRate: number;
}

export class GhostLoadAnalyzer {
  analyze(raw: Record<string, number>): LoadMetrics {
    const cpu    = this.clamp(raw["cpu"]    ?? 0);
    const mem    = this.clamp(raw["mem"]    ?? 0);
    const txRate = Math.max(0, raw["txRate"] ?? 0);

    log.debug(`Load: cpu=${cpu}% mem=${mem}% tx=${txRate}/s`);
    return { cpu, mem, txRate };
  }

  private clamp(v: number): number {
    return Math.min(100, Math.max(0, v));
  }
}
