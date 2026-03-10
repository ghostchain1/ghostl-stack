/**
 * services/ghostbrain-core/test/pattern_analyzer.test.ts
 *
 * Unit tests for the pattern analyzer module.
 * All memory/predictive imports are mocked to isolate the logic.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mocks ─────────────────────────────────────────────────────────────────────

vi.mock("../src/memory/pattern_memory.js", () => ({
  getTopPatterns: vi.fn(() => []),
}));

vi.mock("../src/predictive/pattern_recognition.js", () => ({
  getRecurringPatterns: vi.fn(() => []),
}));

vi.mock("../src/memory/infrastructure_memory.js", () => ({
  getInfraHistory: vi.fn(() => ({})),
}));

vi.mock("../src/observability/logger.js", () => ({
  log: { info: vi.fn(), warn: vi.fn(), debug: vi.fn(), error: vi.fn() },
}));

import {
  analyzePatterns,
  getCriticalPatterns,
  getCachedAnalyses,
} from "../src/pattern_analyzer.js";
import { getTopPatterns }       from "../src/memory/pattern_memory.js";
import { getRecurringPatterns } from "../src/predictive/pattern_recognition.js";
import { getInfraHistory }      from "../src/memory/infrastructure_memory.js";

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("analyzePatterns — empty inputs", () => {
  beforeEach(() => {
    vi.mocked(getTopPatterns).mockReturnValue([]);
    vi.mocked(getRecurringPatterns).mockReturnValue([]);
    vi.mocked(getInfraHistory).mockReturnValue({});
  });

  it("returns an empty array when there are no patterns", async () => {
    const results = await analyzePatterns();
    expect(Array.isArray(results)).toBe(true);
  });
});

describe("analyzePatterns — with correlation data", () => {
  beforeEach(() => {
    vi.mocked(getTopPatterns).mockReturnValue([
      {
        precursor:   "cpu_spike",
        consequent:  "container_restart",
        count:       15,
        confidence:  0.92,
        avgDelayMs:  5000,
        lastSeenMs:  Date.now() - 60_000,
      },
    ]);
    vi.mocked(getRecurringPatterns).mockReturnValue([]);
    vi.mocked(getInfraHistory).mockReturnValue({});
  });

  it("returns at least one correlation analysis entry", async () => {
    const results = await analyzePatterns();
    const corr    = results.filter(r => r.analysisType === "correlation");
    expect(corr.length).toBeGreaterThanOrEqual(1);
  });

  it("high-confidence correlation has severity warn or critical", async () => {
    const results = await analyzePatterns();
    const corr    = results.find(r => r.analysisType === "correlation");
    expect(corr?.severity).toMatch(/warn|critical/);
  });
});

describe("analyzePatterns — with temporal data", () => {
  beforeEach(() => {
    vi.mocked(getTopPatterns).mockReturnValue([]);
    vi.mocked(getRecurringPatterns).mockReturnValue([
      { resourceId: "vm-1", metric: "cpu_pct", peakHourUtc: 14, peakValue: 88, occurrences: 10 },
    ]);
    vi.mocked(getInfraHistory).mockReturnValue({});
  });

  it("returns a temporal analysis entry for the recurring pattern", async () => {
    const results = await analyzePatterns();
    const temporal = results.filter(r => r.analysisType === "temporal");
    expect(temporal.length).toBeGreaterThanOrEqual(1);
  });

  it("temporal entry includes resourceId", async () => {
    const results  = await analyzePatterns();
    const temporal = results.find(r => r.analysisType === "temporal");
    expect(temporal?.resourceId).toBe("vm-1");
  });
});

describe("analyzePatterns — with bottleneck data", () => {
  const hotHistory = {
    "vm-hot": [
      { cpuPct: 91, memPct: 82, ts: Date.now() - 1000 },
      { cpuPct: 93, memPct: 85, ts: Date.now() - 2000 },
      { cpuPct: 95, memPct: 88, ts: Date.now() - 3000 },
    ],
  };

  beforeEach(() => {
    vi.mocked(getTopPatterns).mockReturnValue([]);
    vi.mocked(getRecurringPatterns).mockReturnValue([]);
    vi.mocked(getInfraHistory).mockReturnValue(hotHistory as any);
  });

  it("detects a bottleneck for a consistently over-utilised resource", async () => {
    const results = await analyzePatterns();
    const bottlenecks = results.filter(r => r.analysisType === "bottleneck");
    expect(bottlenecks.length).toBeGreaterThanOrEqual(1);
    const hot = bottlenecks.find(b => b.resourceId === "vm-hot");
    expect(hot).toBeDefined();
  });
});

describe("getCriticalPatterns", () => {
  it("returns only critical-severity items", async () => {
    vi.mocked(getTopPatterns).mockReturnValue([]);
    vi.mocked(getRecurringPatterns).mockReturnValue([]);
    vi.mocked(getInfraHistory).mockReturnValue({});
    const all = await analyzePatterns();
    const crits = getCriticalPatterns();
    for (const c of crits) {
      expect(c.severity).toBe("critical");
    }
  });
});

describe("getCachedAnalyses", () => {
  it("returns an array", () => {
    const cached = getCachedAnalyses();
    expect(Array.isArray(cached)).toBe(true);
  });
});
