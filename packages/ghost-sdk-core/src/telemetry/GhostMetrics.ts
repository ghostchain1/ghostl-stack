// ─────────────────────────────────────────────────────────────────────────────
// GhostMetrics – Rolling counter / gauge / histogram for SDK internals
// ─────────────────────────────────────────────────────────────────────────────

interface Bucket {
  count: number;
  sum: number;
  min: number;
  max: number;
}

export class GhostMetrics {
  private counters = new Map<string, number>();
  private gauges = new Map<string, number>();
  private histograms = new Map<string, Bucket>();

  // ─── Counter ────────────────────────────────────────────────────────────────

  increment(name: string, amount = 1): void {
    this.counters.set(name, (this.counters.get(name) ?? 0) + amount);
  }

  counter(name: string): number {
    return this.counters.get(name) ?? 0;
  }

  // ─── Gauge ──────────────────────────────────────────────────────────────────

  setGauge(name: string, value: number): void {
    this.gauges.set(name, value);
  }

  gauge(name: string): number {
    return this.gauges.get(name) ?? 0;
  }

  // ─── Histogram ──────────────────────────────────────────────────────────────

  record(name: string, value: number): void {
    const existing = this.histograms.get(name) ?? {
      count: 0,
      sum: 0,
      min: Infinity,
      max: -Infinity
    };
    this.histograms.set(name, {
      count: existing.count + 1,
      sum: existing.sum + value,
      min: Math.min(existing.min, value),
      max: Math.max(existing.max, value)
    });
  }

  histogram(name: string): Bucket & { avg: number } {
    const b = this.histograms.get(name) ?? { count: 0, sum: 0, min: 0, max: 0 };
    return { ...b, avg: b.count > 0 ? b.sum / b.count : 0 };
  }

  // ─── Snapshot ───────────────────────────────────────────────────────────────

  snapshot(): {
    counters: Record<string, number>;
    gauges: Record<string, number>;
    histograms: Record<string, ReturnType<GhostMetrics["histogram"]>>;
  } {
    return {
      counters: Object.fromEntries(this.counters),
      gauges: Object.fromEntries(this.gauges),
      histograms: Object.fromEntries(
        [...this.histograms.keys()].map((k) => [k, this.histogram(k)])
      )
    };
  }

  reset(): void {
    this.counters.clear();
    this.gauges.clear();
    this.histograms.clear();
  }
}
