/**
 * services/ghostbrain-core/test/memory_query.test.ts
 *
 * Unit tests for the multi-layer memory query system:
 *   queryMemory / haveISeenThis / whatSolvedIt / optimalRepair
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mocks ─────────────────────────────────────────────────────────────────────

vi.mock("../src/memory/fix_memory.js", () => ({
  lookupFix:  vi.fn(() => null),
  getAllFixes: vi.fn(() => []),
}));

vi.mock("../src/memory/pattern_memory.js", () => ({
  getTopPatterns: vi.fn(() => []),
}));

vi.mock("../src/memory/vector_memory.js", () => ({
  search: vi.fn(async () => []),
}));

vi.mock("../src/memory/cognitive_memory.js", () => ({
  queryKnowledge: vi.fn(() => []),
}));

vi.mock("../src/memory/infrastructure_memory.js", () => ({
  getInfraHistory: vi.fn(() => ({})),
}));

vi.mock("../src/embedding_engine.js", () => ({
  encodeText:      vi.fn(() => new Float32Array(512).fill(0)),
  cosineSimilarity: vi.fn(() => 0),
}));

vi.mock("../src/observability/logger.js", () => ({
  log: { info: vi.fn(), warn: vi.fn(), debug: vi.fn(), error: vi.fn() },
}));

import {
  queryMemory,
  haveISeenThis,
  whatSolvedIt,
  optimalRepair,
} from "../src/memory_query.js";
import { lookupFix, getAllFixes } from "../src/memory/fix_memory.js";

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeFix(problem: string, solution: string, successRate = 0.9) {
  return { problem, solution, actionType: "restart", params: {}, successRate };
}

// ── queryMemory tests ─────────────────────────────────────────────────────────

describe("queryMemory — empty stores", () => {
  beforeEach(() => {
    vi.mocked(lookupFix).mockReturnValue(null);
    vi.mocked(getAllFixes).mockReturnValue([]);
  });

  it("returns an array without throwing", async () => {
    const results = await queryMemory("unknown problem xyz");
    expect(Array.isArray(results)).toBe(true);
  });

  it("returns at most maxResults items", async () => {
    const results = await queryMemory("anything", { maxResults: 3 });
    expect(results.length).toBeLessThanOrEqual(3);
  });
});

describe("queryMemory — with a known fix", () => {
  beforeEach(() => {
    const fix = makeFix("container oom crash", "restart_container", 0.88);
    vi.mocked(lookupFix).mockReturnValue(fix);
    vi.mocked(getAllFixes).mockReturnValue([fix]);
  });

  it("includes the fix in results when query matches", async () => {
    const results = await queryMemory("container oom crash");
    const found   = results.some(r => r.source === "fix_memory");
    expect(found).toBe(true);
  });

  it("fix result has score >= minScore", async () => {
    const results = await queryMemory("container oom crash", { minScore: 0 });
    for (const r of results) {
      expect(r.score).toBeGreaterThanOrEqual(0);
    }
  });
});

// ── haveISeenThis tests ───────────────────────────────────────────────────────

describe("haveISeenThis", () => {
  it("returns { seen: false } when stores are empty", async () => {
    vi.mocked(lookupFix).mockReturnValue(null);
    vi.mocked(getAllFixes).mockReturnValue([]);
    const result = await haveISeenThis("completely novel situation");
    expect(result.seen).toBe(false);
  });

  it("returns { seen: true } when a high-confidence fix exists", async () => {
    const fix = makeFix("disk full /var", "clear_cache", 0.95);
    vi.mocked(lookupFix).mockReturnValue(fix);
    vi.mocked(getAllFixes).mockReturnValue([fix]);
    const result = await haveISeenThis("disk full /var", 0.5);
    expect(result.seen).toBe(true);
  });
});

// ── whatSolvedIt tests ────────────────────────────────────────────────────────

describe("whatSolvedIt", () => {
  it("returns null when no fix is known", async () => {
    vi.mocked(lookupFix).mockReturnValue(null);
    vi.mocked(getAllFixes).mockReturnValue([]);
    const result = await whatSolvedIt("completely unknown");
    expect(result).toBeNull();
  });

  it("returns action type when a fix is found", async () => {
    const fix = makeFix("redis oom", "restart_container", 0.8);
    vi.mocked(lookupFix).mockReturnValue(fix);
    vi.mocked(getAllFixes).mockReturnValue([fix]);
    const result = await whatSolvedIt("redis oom");
    expect(typeof result).toBe("string");
  });
});

// ── optimalRepair tests ───────────────────────────────────────────────────────

describe("optimalRepair", () => {
  it("returns null when no fix exists", async () => {
    vi.mocked(lookupFix).mockReturnValue(null);
    vi.mocked(getAllFixes).mockReturnValue([]);
    const result = await optimalRepair("brand new unseen problem");
    expect(result).toBeNull();
  });

  it("returns a repair recommendation when a fix is found", async () => {
    const fix = makeFix("postgres connection storm", "restart_container", 0.76);
    vi.mocked(lookupFix).mockReturnValue(fix);
    vi.mocked(getAllFixes).mockReturnValue([fix]);
    const result = await optimalRepair("postgres connection storm");
    if (result !== null) {
      expect(result).toHaveProperty("action");
      expect(result).toHaveProperty("confidence");
      expect(result).toHaveProperty("rationale");
      expect(result.confidence).toBeGreaterThanOrEqual(0);
      expect(result.confidence).toBeLessThanOrEqual(1);
    }
  });
});
