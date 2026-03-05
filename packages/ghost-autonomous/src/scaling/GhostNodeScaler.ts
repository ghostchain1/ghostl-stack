import { Logger } from "@ghostchain/devkit";
import { GhostLoadAnalyzer } from "./GhostLoadAnalyzer.js";
import type { LoadMetrics } from "./GhostLoadAnalyzer.js";

const log = Logger.create("NodeScaler");

export type ScaleDecision = "scale-up" | "scale-down" | "stable";

export interface ScaleEvaluation {
  decision: ScaleDecision;
  reason: string;
  metrics: LoadMetrics;
}

export class GhostNodeScaler {
  private readonly analyzer = new GhostLoadAnalyzer();

  evaluate(rawMetrics: Record<string, number>): ScaleEvaluation {
    const m = this.analyzer.analyze(rawMetrics);
    return this.decide(m);
  }

  private decide(m: LoadMetrics): ScaleEvaluation {
    if (m.cpu > 85 || m.mem > 90) {
      const reason = `CPU=${m.cpu}%  MEM=${m.mem}% — over threshold`;
      log.warn(`Scale up: ${reason}`);
      return { decision: "scale-up", reason, metrics: m };
    }

    if (m.cpu < 20 && m.mem < 30 && m.txRate < 5) {
      const reason = `CPU=${m.cpu}%  MEM=${m.mem}%  TX=${m.txRate}/s — underutilised`;
      log.info(`Scale down: ${reason}`);
      return { decision: "scale-down", reason, metrics: m };
    }

    log.debug(`Stable: CPU=${m.cpu}%  MEM=${m.mem}%  TX=${m.txRate}/s`);
    return { decision: "stable", reason: "Metrics within normal range", metrics: m };
  }
}
