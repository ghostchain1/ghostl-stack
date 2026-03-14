/**
 * GhostBrain Memory Engine — Pattern Detector
 *
 * Identifies recurring infrastructure failure patterns by analysing the
 * frequency of event categories within configurable sliding time windows.
 *
 * Detection logic:
 *   - For each category that exceeds a frequency threshold in a given window,
 *     a PatternMatch is emitted.
 *   - Source hotspots (a single source contributing >50 % of events in a
 *     window) are flagged separately as "source_hotspot" patterns.
 *   - Time-of-day analysis: if at least 3 days of history exist and a
 *     category's peak hour has ≥ 3× the average hourly rate, a "time_of_day"
 *     pattern is raised.
 *
 * All pattern detection is read-only — no writes, no side effects.
 */

import type { MemoryReader } from "../engine/memory_reader.js";
import type { EventCategory } from "../models/system_event.js";

// ---------------------------------------------------------------------------
// Output types
// ---------------------------------------------------------------------------

export type PatternKind =
  | "frequency_spike"   // event category fired too many times in window
  | "source_hotspot"    // single source dominates error budget
  | "time_of_day";      // recurring at a specific UTC hour

export interface PatternMatch {
  kind: PatternKind;
  category: EventCategory;
  /** Source identifier, present for source_hotspot. */
  source?: string;
  /** Observed count within the detection window. */
  count: number;
  /** Detection threshold that was crossed. */
  threshold: number;
  /** Length of the analysis window in milliseconds. */
  windowMs: number;
  /** UTC hour (0-23) for time_of_day patterns. */
  peakHour?: number;
  /** Human-readable explanation. */
  message: string;
  detectedAt: number;
}

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

export interface PatternDetectorConfig {
  /**
   * Detection windows: array of [windowMs, threshold] tuples.
   * A category that appears ≥ threshold times in the last windowMs ms triggers
   * a frequency_spike pattern.
   * Default windows:
   *   - 5 min  → 5 events
   *   - 15 min → 10 events
   *   - 1 hour → 20 events
   */
  windows: Array<{ windowMs: number; threshold: number }>;

  /**
   * Minimum fraction of total events in a window that a single source must
   * contribute to be flagged as a hotspot. Default: 0.5 (50 %).
   */
  hotspotFraction: number;

  /**
   * Minimum data points (events) in the time-of-day analysis before a
   * time_of_day pattern is raised. Default: 3.
   */
  minTimeOfDaySamples: number;

  /**
   * Ratio of peak hour count to average hourly count required to raise a
   * time_of_day pattern. Default: 3.0 (3× average).
   */
  timeOfDayRatio: number;
}

const DEFAULT_CONFIG: PatternDetectorConfig = {
  windows: [
    { windowMs: 5  * 60_000, threshold: 5  },
    { windowMs: 15 * 60_000, threshold: 10 },
    { windowMs: 60 * 60_000, threshold: 20 },
  ],
  hotspotFraction:      parseFloat(process.env["MEMORY_HOTSPOT_FRACTION"] ?? "0.5"),
  minTimeOfDaySamples:  parseInt(process.env["MEMORY_TOD_MIN_SAMPLES"]   ?? "3", 10),
  timeOfDayRatio:       parseFloat(process.env["MEMORY_TOD_RATIO"]        ?? "3.0"),
};

// ---------------------------------------------------------------------------
// PatternDetector
// ---------------------------------------------------------------------------

export class PatternDetector {
  private readonly cfg: PatternDetectorConfig;

  constructor(
    private readonly reader: MemoryReader,
    config: Partial<PatternDetectorConfig> = {},
  ) {
    this.cfg = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Run all detectors and return the full set of active patterns.
   * Intended to be called once per supervisor cycle (~every 5 s).
   */
  detect(): PatternMatch[] {
    const now = Date.now();
    const results: PatternMatch[] = [];

    // Frequency spike detection across all configured windows.
    for (const w of this.cfg.windows) {
      const freq = this.reader.frequencyMap(w.windowMs);
      for (const { category, count } of freq) {
        if (count >= w.threshold) {
          results.push({
            kind:      "frequency_spike",
            category,
            count,
            threshold: w.threshold,
            windowMs:  w.windowMs,
            message:
              `"${category}" occurred ${count}× in the last ` +
              `${msToHuman(w.windowMs)} (threshold: ${w.threshold})`,
            detectedAt: now,
          });
        }
      }
    }

    // Source hotspot detection (use the widest window).
    const maxWindow = Math.max(...this.cfg.windows.map(w => w.windowMs));
    const totalInWindow = this.reader.frequencyMap(maxWindow)
      .reduce((s, e) => s + e.count, 0);

    if (totalInWindow > 0) {
      const sourceFreq = this.reader.sourceFrequencyMap(maxWindow);
      for (const { source, count } of sourceFreq) {
        const fraction = count / totalInWindow;
        if (fraction >= this.cfg.hotspotFraction) {
          results.push({
            kind:      "source_hotspot",
            category:  "repair_failed",   // best-effort category label
            source,
            count,
            threshold: Math.ceil(totalInWindow * this.cfg.hotspotFraction),
            windowMs:  maxWindow,
            message:
              `Source "${source}" accounts for ${(fraction * 100).toFixed(1)} % ` +
              `of all events in the last ${msToHuman(maxWindow)}`,
            detectedAt: now,
          });
        }
      }
    }

    // Time-of-day pattern detection (uses 7-day lookback inside MemoryReader).
    const categoriesToCheck: EventCategory[] = [
      "docker_failure", "docker_oom", "vm_crash", "vm_offline",
      "network_degraded", "l2_lag",
    ];
    for (const category of categoriesToCheck) {
      const dist = this.reader.hourlyDistribution(category);
      const totalDist = Array.from(dist.values()).reduce((s, c) => s + c, 0);
      if (totalDist < this.cfg.minTimeOfDaySamples) continue;

      const avgPerHour = totalDist / 24;
      const peak       = this.reader.peakHour(category);
      if (peak && peak.count >= this.cfg.timeOfDayRatio * avgPerHour) {
        results.push({
          kind:      "time_of_day",
          category,
          count:     peak.count,
          threshold: Math.ceil(this.cfg.timeOfDayRatio * avgPerHour),
          windowMs:  7 * 24 * 60 * 60_000,
          peakHour:  peak.hour,
          message:
            `"${category}" peaks at UTC hour ${peak.hour} ` +
            `(${peak.count}× vs avg ${avgPerHour.toFixed(1)}/hr over 7 days)`,
          detectedAt: now,
        });
      }
    }

    return results;
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function msToHuman(ms: number): string {
  if (ms < 60_000)       return `${ms / 1_000}s`;
  if (ms < 3_600_000)    return `${ms / 60_000}min`;
  if (ms < 86_400_000)   return `${ms / 3_600_000}hr`;
  return `${(ms / 86_400_000).toFixed(1)}d`;
}
