/**
 * Test Runner — simulates Hardhat unit, integration, and load test execution.
 */

import { v4 as uuid } from "uuid";
import logger from "../utils/logger";

export type TestType   = "unit" | "integration" | "load" | "e2e";
export type TestStatus = "running" | "passed" | "failed" | "skipped";

export interface TestCase {
  name:     string;
  status:   TestStatus;
  duration: number;   // ms
  error?:   string;
}

export interface TestRun {
  id:         string;
  target:     string;   // contract or service name
  type:       TestType;
  suite:      string;
  totalTests: number;
  passed:     number;
  failed:     number;
  skipped:    number;
  coverage:   number;   // percent
  duration:   number;   // ms
  status:     "passed" | "failed" | "running";
  cases:      TestCase[];
  timestamp:  number;
}

const MAX_RUNS = 200;
const store: TestRun[] = [];

function pick<T>(arr: T[]): T { return arr[Math.floor(Math.random() * arr.length)]!; }
function rand(a: number, b: number) { return Math.floor(Math.random() * (b - a + 1)) + a; }

const UNIT_CASES: Record<string, string[]> = {
  staking:    ["should stake tokens correctly", "should enforce minimum stake", "should enforce lock period", "should calculate rewards correctly", "should allow owner to update reward rate", "should emit Staked event", "should emit Unstaked event"],
  governance: ["should create proposal", "should allow voting", "should reject double votes", "should enforce quorum", "should execute passed proposal", "should reject failed proposal"],
  token:      ["should mint initial supply", "should not exceed max supply", "should burn tokens", "should enforce blacklist", "should transfer correctly"],
  bridge:     ["should bridge out with fee", "should bridge in and process nonce", "should reject duplicate nonce", "should update validators"],
  service:    ["should return 200 on /health", "should seed data on startup", "should run cron without error", "should handle 404 gracefully", "should enforce rate limiting"],
};

function generateCases(target: string, type: TestType, total: number, failRate: number): TestCase[] {
  const category   = Object.keys(UNIT_CASES).find(k => target.toLowerCase().includes(k)) ?? "service";
  const baseCases  = UNIT_CASES[category] ?? UNIT_CASES["service"]!;
  const cases: TestCase[] = [];
  for (let i = 0; i < total; i++) {
    const name   = baseCases[i % baseCases.length] ?? `test_${i}`;
    const failed = Math.random() < failRate;
    const skipped = !failed && Math.random() < 0.03;
    cases.push({
      name:     `${type.toUpperCase()} › ${name}`,
      status:   failed ? "failed" : skipped ? "skipped" : "passed",
      duration: rand(8, type === "load" ? 4800 : 340),
      ...(failed ? { error: pick(["AssertionError: expected 100 but got 98", "Error: RevertWithReason: lock period not expired", "TimeoutError: test exceeded 5000ms", "revert: insufficient balance"]) } : {}),
    });
  }
  return cases;
}

function seed() {
  const types: TestType[] = ["unit", "integration", "unit", "unit", "load", "e2e"];
  const targets = ["GhostStaking", "GhostSwapPool", "GhostDAO", "GhostBridge", "ai-governance", "ai-economy", "ai-infrastructure", "ai-agents", "GhostToken", "GhostMarket"];
  for (let i = 0; i < 12; i++) {
    const type     = pick(types);
    const target   = pick(targets);
    const total    = rand(type === "unit" ? 20 : 8, type === "unit" ? 80 : 30);
    const failRate = Math.random() < 0.25 ? rand(1, 3) / 100 : 0;
    const cases    = generateCases(target, type, total, failRate);
    const failed   = cases.filter(c => c.status === "failed").length;
    const skipped  = cases.filter(c => c.status === "skipped").length;
    const hoursAgo = rand(1, 120);
    store.push({
      id:         uuid(),
      target,
      type,
      suite:      `${target}.${type}.test`,
      totalTests: total,
      passed:     total - failed - skipped,
      failed,
      skipped,
      coverage:   rand(72, 99),
      duration:   cases.reduce((s, c) => s + c.duration, 0),
      status:     failed > 0 ? "failed" : "passed",
      cases,
      timestamp:  Date.now() - hoursAgo * 3_600_000,
    });
  }
  logger.info(`[TestRunner] Seeded ${store.length} test runs`);
}

export function runTests(target: string, type: TestType = "unit"): TestRun {
  const total    = rand(type === "unit" ? 20 : 8, type === "unit" ? 80 : 30);
  const failRate = Math.random() < 0.1 ? rand(1, 5) / 100 : 0;
  const cases    = generateCases(target, type, total, failRate);
  const failed   = cases.filter(c => c.status === "failed").length;
  const skipped  = cases.filter(c => c.status === "skipped").length;
  const run: TestRun = {
    id:         uuid(),
    target,
    type,
    suite:      `${target}.${type}.test`,
    totalTests: total,
    passed:     total - failed - skipped,
    failed,
    skipped,
    coverage:   rand(72, 99),
    duration:   cases.reduce((s, c) => s + c.duration, 0),
    status:     failed > 0 ? "failed" : "passed",
    cases,
    timestamp:  Date.now(),
  };
  store.unshift(run);
  if (store.length > MAX_RUNS) store.pop();
  logger.info(`[TestRunner] ${type} run for ${target}: ${run.passed}/${total} passed (coverage ${run.coverage}%)`);
  return run;
}

export function getTestRuns(opts: {
  target?: string; type?: TestType; status?: "passed" | "failed" | "running"; limit?: number;
} = {}): TestRun[] {
  let runs = [...store];
  if (opts.target) runs = runs.filter(r => r.target === opts.target);
  if (opts.type)   runs = runs.filter(r => r.type   === opts.type);
  if (opts.status) runs = runs.filter(r => r.status  === opts.status);
  return runs.slice(0, opts.limit ?? 50);
}

export function getTestStats() {
  return {
    total:     store.length,
    passed:    store.filter(r => r.status === "passed").length,
    failed:    store.filter(r => r.status === "failed").length,
    totalCases: store.reduce((s, r) => s + r.totalTests, 0),
    avgCoverage: store.length ? Math.round(store.reduce((s, r) => s + r.coverage, 0) / store.length) : 0,
    byType:    Object.fromEntries((["unit","integration","load","e2e"] as TestType[]).map(t => [t, store.filter(r => r.type === t).length])),
  };
}

seed();
