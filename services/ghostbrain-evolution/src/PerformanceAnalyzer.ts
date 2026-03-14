/**
 * PerformanceAnalyzer — measures service-level KPIs and detects regressions.
 */
export interface ServiceMetrics {
  service:      string;
  tps:          number;   // transactions per second
  latencyMs:    number;
  errorRate:    number;   // 0–1
  uptimeRatio:  number;   // 0–1
  timestamp:    number;
}

export interface PerformanceReport {
  service:      string;
  status:       "healthy" | "degraded" | "critical";
  score:        number;   // 0–100 composite
  suggestions:  string[];
}

export class PerformanceAnalyzer {
  private snapshots: Map<string, ServiceMetrics[]> = new Map();

  record(m: ServiceMetrics): void {
    const hist = this.snapshots.get(m.service) ?? [];
    hist.push(m);
    if (hist.length > 500) hist.shift();
    this.snapshots.set(m.service, hist);
  }

  analyze(service: string): PerformanceReport {
    const hist = this.snapshots.get(service) ?? [];
    if (hist.length === 0) {
      return { service, status: "healthy", score: 100, suggestions: [] };
    }

    const latest = hist[hist.length - 1];
    const suggestions: string[] = [];

    // Composite score = uptime(40) + errorRate(30) + latency(30)
    const uptimeScore  = latest.uptimeRatio * 40;
    const errorScore   = (1 - latest.errorRate) * 30;
    const latencyScore = Math.max(0, 30 - latest.latencyMs / 100);
    const score        = Math.round(uptimeScore + errorScore + latencyScore);

    if (latest.uptimeRatio < 0.99) suggestions.push("Investigate uptime drops — check node health");
    if (latest.errorRate   > 0.01) suggestions.push("Error rate above 1 % — review recent deployments");
    if (latest.latencyMs   > 500)  suggestions.push("High latency detected — consider horizontal scaling");
    if (latest.tps         < 10)   suggestions.push("Low TPS — validator or RPC bottleneck suspected");

    return {
      service,
      status: score >= 80 ? "healthy" : score >= 50 ? "degraded" : "critical",
      score,
      suggestions,
    };
  }

  allServices(): string[] {
    return [...this.snapshots.keys()];
  }
}
