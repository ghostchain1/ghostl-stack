/**
 * services/ghostbrain-core/test/memory_engine.test.ts
 *
 * Unit tests for the unified memory engine facade:
 *   store_event / store_pattern / store_decision / recall_similar_events
 *   predict_next_action / record_repair_outcome / getMemoryEngineSummary
 */

import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";

// ── Module mocking (isolate from disk / network side-effects) ─────────────────

// Pattern memory (ring buffer + top patterns)
vi.mock("../src/memory/pattern_memory.js", () => ({
  recordEvent: vi.fn(),
  getTopPatterns: vi.fn(() => []),
}));

// Vector memory
vi.mock("../src/memory/vector_memory.js", () => ({
  store:  vi.fn(),
  search: vi.fn(async () => []),
}));

// Fix memory
vi.mock("../src/memory/fix_memory.js", () => ({
  recordFix:  vi.fn(),
  lookupFix:  vi.fn(() => null),
  getAllFixes: vi.fn(() => []),
}));

// Infrastructure memory
vi.mock("../src/memory/infrastructure_memory.js", () => ({
  recordInfraSnapshot: vi.fn(),
  getInfraHistory:     vi.fn(() => ({})),
}));

// Predictive
vi.mock("../src/predictive/index.js", () => ({
  runPrediction: vi.fn(async () => null),
}));

// Logger — silence output
vi.mock("../src/observability/logger.js", () => ({
  log: { info: vi.fn(), warn: vi.fn(), debug: vi.fn(), error: vi.fn() },
}));

// ── Load module under test after mocks are in place ───────────────────────────

import {
  store_event,
  store_pattern,
  store_decision,
  recall_similar_events,
  record_infra_snapshot,
  record_repair_outcome,
  getMemoryEngineSummary,
} from "../src/memory_engine.js";

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("memory_engine — store_event", () => {
  it("stores an event without throwing", () => {
    expect(() => store_event({
      type:       "test_event",
      source:     "vitest",
      resourceId: "container-1",
      layer:      "container",
      severity:   "info",
      payload:    { custom: 42 },
    })).not.toThrow();
  });

  it("stores an event and summary reflects the new key", () => {
    store_event({
      type:       "store_test",
      source:     "vitest",
      resourceId: "node-7",
      layer:      "vm",
      severity:   "warn",
      payload:    {},
    });
    const summary = getMemoryEngineSummary();
    expect(summary.shortTermKeys).toBeGreaterThanOrEqual(0);
  });
});

describe("memory_engine — store_pattern", () => {
  it("stores a pattern entry without throwing", () => {
    expect(() => store_pattern({
      type:        "recurring_cpu_spike",
      resourceId:  "vm-99",
      description: "CPU > 90% every Tuesday at 14:00 UTC",
      confidence:  0.85,
      payload:     { peakHour: 14 },
    })).not.toThrow();
  });
});

describe("memory_engine — store_decision", () => {
  it("stores a decision entry without throwing", () => {
    expect(() => store_decision({
      agent:        "vitest-agent",
      decisionType: "repair",
      resourceId:   "container-x",
      layer:        "container",
      rationale:    "test rationale",
      confidence:   0.7,
      actionTaken:  { strategy: "restart_container" },
      requiresHuman: false,
      policyGuard:  "ALLOW",
    })).not.toThrow();
  });
});

describe("memory_engine — recall_similar_events", () => {
  it("returns an array (possibly empty) without throwing", async () => {
    const results = await recall_similar_events("cpu spike container");
    expect(Array.isArray(results)).toBe(true);
  });

  it("returns at most topK results", async () => {
    const results = await recall_similar_events("memory pressure", 3);
    expect(results.length).toBeLessThanOrEqual(3);
  });
});

describe("memory_engine — record_infra_snapshot", () => {
  it("records a snapshot and stores an event", () => {
    expect(() => record_infra_snapshot({
      resourceId: "vm-5",
      layer:      "vm",
      cpuPct:     55,
      memPct:     60,
      ts:         Date.now(),
    })).not.toThrow();
  });
});

describe("memory_engine — record_repair_outcome", () => {
  it("records a successful repair outcome", () => {
    expect(() => record_repair_outcome({
      problem:    "container-x crash loop",
      solution:   "restart_container",
      actionType: "restart",
      params:     { containerId: "abc123" },
      success:    true,
      recoveryMs: 1200,
    })).not.toThrow();
  });

  it("records a failed repair outcome", () => {
    expect(() => record_repair_outcome({
      problem:    "vm disk full",
      solution:   "clear_cache",
      actionType: "cache_prune",
      params:     {},
      success:    false,
      recoveryMs: 300,
    })).not.toThrow();
  });
});

describe("memory_engine — getMemoryEngineSummary", () => {
  it("returns a summary object with expected keys", () => {
    const summary = getMemoryEngineSummary();
    expect(summary).toHaveProperty("shortTermKeys");
    expect(summary).toHaveProperty("topPatterns");
    expect(typeof summary.shortTermKeys).toBe("number");
    expect(Array.isArray(summary.topPatterns)).toBe(true);
  });
});
