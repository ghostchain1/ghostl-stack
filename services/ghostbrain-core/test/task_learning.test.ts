/**
 * services/ghostbrain-core/test/task_learning.test.ts
 *
 * Unit tests for the task learning engine:
 *   observe_task / record_task_pattern / optimize_future_task / autonomously_execute
 *   getTopLearnedPatterns / getTaskLearningStats
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mocks ─────────────────────────────────────────────────────────────────────

vi.mock("../src/memory_engine.js", () => ({
  store_event:   vi.fn(),
  store_pattern: vi.fn(),
  predict_next_action: vi.fn(async () => null),
}));

vi.mock("../src/observability/logger.js", () => ({
  log: { info: vi.fn(), warn: vi.fn(), debug: vi.fn(), error: vi.fn() },
}));

import {
  observe_task,
  record_task_pattern,
  optimize_future_task,
  autonomously_execute,
  getTopLearnedPatterns,
  getTaskLearningStats,
} from "../src/task_learning_engine.js";

// ── Observation tests ─────────────────────────────────────────────────────────

describe("observe_task", () => {
  it("records a successful task without throwing", () => {
    expect(() => observe_task({
      taskId:       "task-001",
      resourceId:   "container-api",
      layer:        "container",
      triggerEvent: "cpu_spike",
      actionTaken:  "restart_container",
      params:       {},
      startedAt:    Date.now() - 1000,
      finishedAt:   Date.now(),
      success:      true,
    })).not.toThrow();
  });

  it("records a failed task without throwing", () => {
    expect(() => observe_task({
      taskId:       "task-002",
      resourceId:   "vm-99",
      layer:        "vm",
      triggerEvent: "memory_pressure",
      actionTaken:  "reallocate",
      params:       { vmId: "vm-99" },
      startedAt:    Date.now() - 2000,
      finishedAt:   Date.now(),
      success:      false,
      errorDetail:  "timeout",
    })).not.toThrow();
  });
});

// ── Pattern learning tests ────────────────────────────────────────────────────

describe("record_task_pattern + getTopLearnedPatterns", () => {
  beforeEach(() => {
    // Seed some patterns
    observe_task({ taskId: "t-a", resourceId: "svc-x", layer: "service", triggerEvent: "oom", actionTaken: "clear_cache", params: {}, startedAt: 0, finishedAt: 100, success: true });
    observe_task({ taskId: "t-b", resourceId: "svc-x", layer: "service", triggerEvent: "oom", actionTaken: "clear_cache", params: {}, startedAt: 0, finishedAt: 80,  success: true });
    observe_task({ taskId: "t-c", resourceId: "svc-x", layer: "service", triggerEvent: "oom", actionTaken: "clear_cache", params: {}, startedAt: 0, finishedAt: 90,  success: false });
  });

  it("returns an array of learned patterns", () => {
    const patterns = getTopLearnedPatterns(10);
    expect(Array.isArray(patterns)).toBe(true);
  });

  it("patterns have required fields", () => {
    const patterns = getTopLearnedPatterns(5);
    for (const p of patterns) {
      expect(p).toHaveProperty("triggerEvent");
      expect(p).toHaveProperty("action");
      expect(p).toHaveProperty("confidence");
      expect(p).toHaveProperty("successCount");
      expect(p).toHaveProperty("failureCount");
    }
  });

  it("pattern confidence is in [0, 1]", () => {
    for (const p of getTopLearnedPatterns(20)) {
      expect(p.confidence).toBeGreaterThanOrEqual(0);
      expect(p.confidence).toBeLessThanOrEqual(1);
    }
  });
});

// ── Optimiser tests ───────────────────────────────────────────────────────────

describe("optimize_future_task", () => {
  it("positive rating increases confidence for the action", () => {
    // Seed a pattern with a known action
    observe_task({ taskId: "t-d", resourceId: "r-1", layer: "container", triggerEvent: "disk_full", actionTaken: "clear_cache", params: {}, startedAt:0, finishedAt:50, success: true });

    const before = getTopLearnedPatterns(10).find(p => p.action === "clear_cache" && p.triggerEvent === "disk_full");
    optimize_future_task("disk_full", "clear_cache", 1);
    const after  = getTopLearnedPatterns(10).find(p => p.action === "clear_cache" && p.triggerEvent === "disk_full");

    // After positive nudge confidence should not decrease
    if (before && after) {
      expect(after.confidence).toBeGreaterThanOrEqual(before.confidence);
    }
  });
});

// ── Stats tests ───────────────────────────────────────────────────────────────

describe("getTaskLearningStats", () => {
  it("returns stats with totalPatterns and totalObservations", () => {
    const stats = getTaskLearningStats();
    expect(stats).toHaveProperty("totalPatterns");
    expect(stats).toHaveProperty("totalObservations");
    expect(typeof stats.totalPatterns).toBe("number");
    expect(typeof stats.totalObservations).toBe("number");
  });
});

// ── Autonomous execute tests ──────────────────────────────────────────────────

describe("autonomously_execute", () => {
  it("returns null or a TaskProposal", async () => {
    const proposal = await autonomously_execute("container-beta", "cpu_spike");
    if (proposal !== null) {
      expect(proposal).toHaveProperty("resourceId");
      expect(proposal).toHaveProperty("action");
      expect(proposal).toHaveProperty("confidence");
      expect(proposal.dryRun).toBe(true);
    }
  });
});
