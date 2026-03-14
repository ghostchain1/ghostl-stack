import { PerformanceAnalyzer, ServiceMetrics } from "../src/PerformanceAnalyzer";

const analyzer = new PerformanceAnalyzer();

export const OptimizationAgent = {
  name: "OptimizationAgent",
  description: "Collects metrics and flags services requiring performance improvements",

  async react(event: { type: string; payload: Record<string, unknown> }): Promise<void> {
    if (event.type === "metrics_update") {
      const m = event.payload as unknown as ServiceMetrics;
      analyzer.record(m);
      const report = analyzer.analyze(m.service);
      console.log(
        `[OptimizationAgent] ${m.service}: ${report.status} (score ${report.score})` +
        (report.suggestions.length ? `\n  → ${report.suggestions.join("\n  → ")}` : "")
      );
    }
  },
};
