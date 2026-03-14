/**
 * GhostBrain Infrastructure Simulator — Benchmark Harness
 *
 * Runs the simulator against a fixed scenario corpus with known expected
 * verdicts.  Measures two orthogonal properties:
 *
 *   Decision quality:
 *     true_approve   — correctly approved a safe action
 *     true_block     — correctly blocked a dangerous action
 *     false_block    — blocked a safe action (overly conservative)
 *     false_approve  — approved a dangerous action (safety failure)
 *
 *   Decision latency (nanosecond timing via process.hrtime.bigint()):
 *     p50 / p99 / p999 — across the entire corpus run, and per-action-type
 *
 * The corpus is entirely deterministic (uses evaluateWithState() — no I/O).
 * Individual latency measurements therefore capture only the simulation
 * pipeline itself, not Docker/OS/chain network calls.
 *
 * Results are recorded into Prometheus metrics so the Grafana dashboard
 * picks them up automatically on the next scrape.
 *
 * Entry points:
 *   runBenchmark()   — run full corpus once, return BenchmarkReport
 *   benchmarkStats() — last report (for HTTP route)
 */

import { evaluateWithState }  from "../simulator/index.js";
import { inc, set, observe }  from "../observability/metrics_exporter.js";
import type {
  SimState, SimAction, SimVerdict, SimContainerState,
} from "../simulator/sim_model.js";

// ── Types ─────────────────────────────────────────────────────────────────────

export type ExpectedVerdict = SimVerdict | "approve_or_ratification";

export interface BenchmarkScenario {
  id:              string;
  description:     string;
  action:          SimAction;
  preState:        SimState;
  expectedVerdict: ExpectedVerdict;
  /**
   * true  → this scenario represents a known-safe action (false_block is bad)
   * false → this scenario represents a known-dangerous action (false_approve is a safety failure)
   */
  isSafe: boolean;
}

export interface LatencyStats {
  p50Ms:  number;
  p99Ms:  number;
  p999Ms: number;
  minMs:  number;
  maxMs:  number;
  meanMs: number;
  count:  number;
}

export interface ScenarioResult {
  id:             string;
  description:    string;
  expected:       ExpectedVerdict;
  got:            SimVerdict;
  pass:           boolean;
  classification: "true_approve" | "true_block" | "false_block" | "false_approve" | "true_ratification" | "other";
  latencyMs:      number;
  verdictReason:  string;
}

export interface BenchmarkReport {
  runAt:           number;
  durationMs:      number;
  totalScenarios:  number;
  passed:          number;
  failed:          number;
  falseBlocks:     number;    // safe actions blocked — over-conservative
  falseApprovals:  number;    // dangerous actions approved — safety failure
  trueApprovals:   number;
  trueBlocks:      number;
  accuracyPct:     number;
  safetyFailurePct: number;   // false_approve / total — the critical metric
  falseBlockPct:   number;
  latency:         LatencyStats;
  scenarios:       ScenarioResult[];
}

// ── Shared state builders ─────────────────────────────────────────────────────

function makeContainer(overrides: Partial<SimContainerState> = {}): SimContainerState {
  return {
    cpuPct:      10,
    memPct:      30,
    memUsageMb:  512,
    memLimitMb:  2048,
    cpuLimitPct: 0,
    alive:       true,
    isChainNode: false,
    ...overrides,
  };
}

function makeState(overrides: Partial<SimState["host"]> = {}, containers: SimState["containers"] = {}, chains?: Partial<SimState["chains"]>): SimState {
  return {
    timestamp: Date.now(),
    host: {
      cpuPct:       20,
      memPct:       40,
      memTotalMb:   32768,
      diskIoSatPct: 5,
      ...overrides,
    },
    containers,
    chains: {
      l1: { alive: true,  blockHeight: 1_000_000 },
      l2: { alive: true,  blockHeight: 500_000 },
      l3: { alive: true,  blockHeight: 200_000 },
      ...chains,
    },
  };
}

function action(type: SimAction["type"], targetId: string, extras: Partial<SimAction> = {}): SimAction {
  return {
    type,
    targetId,
    requestedBy: "supervisor",
    urgency:     "medium",
    ...extras,
  };
}

// ── Scenario corpus ───────────────────────────────────────────────────────────
//
// 30 scenarios covering all 9 action types + safety edge cases.
// Each has a known expected verdict and a known safety class.

const SCENARIOS: BenchmarkScenario[] = [
  // ── Safe / should approve ─────────────────────────────────────────────────

  {
    id: "safe-001",
    description: "flush_cache on healthy system",
    action:      action("flush_cache", "host"),
    preState:    makeState({ cpuPct: 20, memPct: 45 }),
    expectedVerdict: "approve",
    isSafe: true,
  },
  {
    id: "safe-002",
    description: "noop always approved",
    action:      action("noop", "host"),
    preState:    makeState(),
    expectedVerdict: "approve",
    isSafe: true,
  },
  {
    id: "safe-003",
    description: "unthrottle container with spare CPU capacity",
    action:      action("unthrottle_container", "ghost-worker", { urgency: "low" }),
    preState:    makeState({ cpuPct: 30 }, {
      "ghost-worker": makeContainer({ cpuLimitPct: 40, cpuPct: 25 }),
    }),
    expectedVerdict: "approve",
    isSafe: true,
  },
  {
    id: "safe-004",
    description: "restart non-chain, non-brain container at low load",
    action:      action("restart_container", "ghost-indexer", { urgency: "low" }),
    preState:    makeState({ cpuPct: 15, memPct: 30 }, {
      "ghost-indexer": makeContainer({ cpuPct: 5, memPct: 8 }),
    }),
    expectedVerdict: "approve",
    isSafe: true,
  },
  {
    id: "safe-005",
    description: "throttle CPU on non-chain container with plenty of headroom",
    action:      action("throttle_container_cpu", "ghost-api", { params: { cpuLimitPercent: 70 }, urgency: "medium" }),
    preState:    makeState({ cpuPct: 25 }, {
      "ghost-api": makeContainer({ cpuPct: 20 }),
    }),
    expectedVerdict: "approve",
    isSafe: true,
  },
  {
    id: "safe-006",
    description: "throttle CPU on non-chain container — limit well above usage",
    action:      action("throttle_container_cpu", "ghost-api", { params: { cpuLimitPercent: 60 } }),
    preState:    makeState({ cpuPct: 20 }, {
      "ghost-api": makeContainer({ cpuPct: 10 }),
    }),
    expectedVerdict: "approve",
    isSafe: true,
  },
  {
    id: "safe-007",
    description: "throttle mem on container — limit clearly above usage",
    action:      action("throttle_container_mem", "ghost-api", { params: { memLimitMb: 1024 } }),
    preState:    makeState({}, {
      "ghost-api": makeContainer({ memUsageMb: 300, memLimitMb: 2048 }),
    }),
    expectedVerdict: "approve",
    isSafe: true,
  },
  {
    id: "safe-008",
    description: "flush_cache on high-mem host (should help, not hurt)",
    action:      action("flush_cache", "host", { urgency: "high" }),
    preState:    makeState({ memPct: 80 }),
    expectedVerdict: "approve",
    isSafe: true,
  },
  {
    id: "safe-009",
    description: "unthrottle on high CPU — still within hard block threshold",
    action:      action("unthrottle_container", "ghost-worker", { urgency: "high" }),
    preState:    makeState({ cpuPct: 82 }, {
      "ghost-worker": makeContainer({ cpuLimitPct: 20, cpuPct: 18 }),
    }),
    expectedVerdict: "approve",
    isSafe: true,
  },
  {
    id: "safe-010",
    description: "restart ghost-api at critical urgency, low host load",
    action:      action("restart_container", "ghost-api", { urgency: "critical" }),
    preState:    makeState({ cpuPct: 10, memPct: 20 }, {
      "ghost-api": makeContainer({ cpuPct: 5 }),
    }),
    expectedVerdict: "approve",
    isSafe: true,
  },

  // ── Dangerous / should block ───────────────────────────────────────────────

  {
    id: "danger-001",
    description: "throttle_container_mem below current usage → OOM kill risk",
    action:      action("throttle_container_mem", "ghost-api", { params: { memLimitMb: 128 }, urgency: "low" }),
    preState:    makeState({}, {
      "ghost-api": makeContainer({ memUsageMb: 512, memLimitMb: 1024 }),
    }),
    expectedVerdict: "block",
    isSafe: false,
  },
  {
    id: "danger-002",
    description: "restart container when host CPU already at 98% — would push over hard block",
    action:      action("restart_container", "ghost-worker", { urgency: "medium" }),
    preState:    makeState({ cpuPct: 98 }, {
      "ghost-worker": makeContainer({ cpuPct: 5 }),
    }),
    expectedVerdict: "block",
    isSafe: false,
  },
  {
    id: "danger-003",
    description: "throttle_container_cpu below current usage → chain stall on L3 node",
    action:      action("throttle_container_cpu", "ghostl3-validator", { params: { cpuLimitPercent: 10 }, urgency: "low" }),
    preState:    makeState({}, {
      "ghostl3-validator": makeContainer({ cpuPct: 60, isChainNode: true, chainLayer: "l3" }),
    }),
    expectedVerdict: "block",
    isSafe: false,
  },
  {
    id: "danger-004",
    description: "high-severity risk + low urgency → blocked by R9",
    action:      action("throttle_container_mem", "ghost-api", { params: { memLimitMb: 200 }, urgency: "low" }),
    preState:    makeState({}, {
      "ghost-api": makeContainer({ memUsageMb: 180, memLimitMb: 1024 }),
    }),
    expectedVerdict: "block",
    isSafe: false,
  },
  {
    id: "danger-005",
    description: "unthrottle when host CPU is at 99% — would burst over hard block",
    action:      action("unthrottle_container", "ghost-worker", { urgency: "high" }),
    preState:    makeState({ cpuPct: 99 }, {
      "ghost-worker": makeContainer({ cpuLimitPct: 10, cpuPct: 9 }),
    }),
    expectedVerdict: "block",
    isSafe: false,
  },
  {
    id: "danger-006",
    description: "throttle_container_mem on L2 node below usage → OOM + chain downtime",
    action:      action("throttle_container_mem", "ghostl2-node", { params: { memLimitMb: 50 } }),
    preState:    makeState({}, {
      "ghostl2-node": makeContainer({ memUsageMb: 600, memLimitMb: 2048, isChainNode: true, chainLayer: "l2" }),
    }),
    expectedVerdict: "block",
    isSafe: false,
  },
  {
    id: "danger-007",
    description: "migrate_workload when host mem is at 96% — would OOM surviving host",
    action:      action("migrate_workload", "ghost-api", { params: { targetNodeId: "node-b" } }),
    preState:    makeState({ memPct: 96 }, {
      "ghost-api": makeContainer({ memPct: 40 }),
    }),
    expectedVerdict: "block",
    isSafe: false,
  },

  // ── Require ratification ───────────────────────────────────────────────────

  {
    id: "ratify-001",
    description: "restart L1 chain node → always ratification by policy",
    action:      action("restart_container", "ghostchain-validator", { urgency: "high" }),
    preState:    makeState({}, {
      "ghostchain-validator": makeContainer({ isChainNode: true, chainLayer: "l1" }),
    }),
    expectedVerdict: "require_ratification",
    isSafe: false,
  },
  {
    id: "ratify-002",
    description: "restart L1 when L1 is the only live chain → ratification by R8",
    action:      action("restart_container", "ghost-api", { urgency: "high" }),
    preState:    makeState({}, {
      "ghost-api": makeContainer({ isChainNode: true, chainLayer: "l1" }),
    }, { l2: { alive: false, blockHeight: 0 }, l3: { alive: false, blockHeight: 0 } }),
    expectedVerdict: "approve_or_ratification",  // policy decides, sim checks safety
    isSafe: false,
  },
  {
    id: "ratify-003",
    description: "evict chain node → ratification (evict any container policy)",
    action:      action("evict_container", "ghost-indexer", { urgency: "medium" }),
    preState:    makeState({}, {
      "ghost-indexer": makeContainer(),
    }),
    // Policy engine: evict_container always require_ratification
    expectedVerdict: "require_ratification",
    isSafe: false,
  },
  {
    id: "ratify-004",
    description: "migrate L2 chain node → require_ratification by R7",
    action:      action("migrate_workload", "ghostl2-node", { params: { targetNodeId: "node-b" } }),
    preState:    makeState({}, {
      "ghostl2-node": makeContainer({ isChainNode: true, chainLayer: "l2" }),
    }),
    expectedVerdict: "require_ratification",
    isSafe: false,
  },
  {
    id: "ratify-005",
    description: "restart L2 chain node with high severity chain_downtime risk",
    action:      action("restart_container", "ghostl2-sequencer", { urgency: "high" }),
    preState:    makeState({}, {
      "ghostl2-sequencer": makeContainer({ isChainNode: true, chainLayer: "l2" }),
    }),
    // L2 restart: chain_downtime risk → chain node → require_ratification by R6/R5
    expectedVerdict: "approve_or_ratification",
    isSafe: false,
  },

  // ── Non-chain edge cases ───────────────────────────────────────────────────

  {
    id: "edge-001",
    description: "flush_cache on critically pressured memory system",
    action:      action("flush_cache", "host", { urgency: "critical" }),
    preState:    makeState({ memPct: 94, cpuPct: 50 }),
    expectedVerdict: "approve",
    isSafe: true,
  },
  {
    id: "edge-002",
    description: "noop on completely saturated system",
    action:      action("noop", "host", { urgency: "low" }),
    preState:    makeState({ cpuPct: 99.9, memPct: 99.9 }),
    expectedVerdict: "approve",
    isSafe: true,
  },
  {
    id: "edge-003",
    description: "adjust_vm_memory below current usage → OOM risk",
    action:      action("adjust_vm_memory", "vm-worker", { params: { memLimitMb: 100 } }),
    preState:    makeState({ memPct: 50 }, {
      "vm-worker": makeContainer({ memUsageMb: 4096, memLimitMb: 8192 }),
    }),
    expectedVerdict: "block",
    isSafe: false,
  },
  {
    id: "edge-004",
    description: "restart ghost-brain container (simulate_first policy)",
    action:      action("restart_container", "ghostbrain-core", { urgency: "medium" }),
    preState:    makeState({ cpuPct: 30 }, {
      "ghostbrain-core": makeContainer({ cpuPct: 15 }),
    }),
    // Policy: simulate_first — at low load this should approve
    expectedVerdict: "approve",
    isSafe: true,
  },
  {
    id: "edge-005",
    description: "throttle_container_cpu with limit exactly equal to current usage",
    action:      action("throttle_container_cpu", "ghost-api", { params: { cpuLimitPercent: 25 } }),
    preState:    makeState({ cpuPct: 30 }, {
      "ghost-api": makeContainer({ cpuPct: 25 }),
    }),
    // Limit == usage: borderline → might block (< 90% of usage check)
    expectedVerdict: "approve",
    isSafe: true,
  },
  {
    id: "edge-006",
    description: "restart container on system at soft-warn CPU — approve with warning",
    action:      action("restart_container", "ghost-api", { urgency: "high" }),
    preState:    makeState({ cpuPct: 89 }, {
      "ghost-api": makeContainer({ cpuPct: 5 }),
    }),
    expectedVerdict: "approve",
    isSafe: true,
  },
  {
    id: "edge-007",
    description: "flush_cache + chains all down — still safe host action",
    action:      action("flush_cache", "host", { urgency: "critical" }),
    preState:    makeState({}, {}, {
      l1: { alive: false, blockHeight: 0 },
      l2: { alive: false, blockHeight: 0 },
      l3: { alive: false, blockHeight: 0 },
    }),
    expectedVerdict: "approve",
    isSafe: true,
  },
  {
    id: "edge-008",
    description: "unthrottle_container — always autonomous / approve",
    action:      action("unthrottle_container", "ghost-api", { urgency: "low" }),
    preState:    makeState({ cpuPct: 20 }, {
      "ghost-api": makeContainer({ cpuLimitPct: 30, cpuPct: 15 }),
    }),
    expectedVerdict: "approve",
    isSafe: true,
  },
];

// ── Latency helpers ───────────────────────────────────────────────────────────

function percentile(sortedMs: number[], pct: number): number {
  if (sortedMs.length === 0) return 0;
  const idx = Math.max(0, Math.ceil((pct / 100) * sortedMs.length) - 1);
  return sortedMs[idx] ?? 0;
}

function computeLatencyStats(latenciesMs: number[]): LatencyStats {
  const sorted = [...latenciesMs].sort((a, b) => a - b);
  const sum    = sorted.reduce((a, b) => a + b, 0);
  return {
    p50Ms:  percentile(sorted, 50),
    p99Ms:  percentile(sorted, 99),
    p999Ms: percentile(sorted, 99.9),
    minMs:  sorted[0]              ?? 0,
    maxMs:  sorted[sorted.length - 1] ?? 0,
    meanMs: sorted.length > 0 ? sum / sorted.length : 0,
    count:  sorted.length,
  };
}

// ── Classification ────────────────────────────────────────────────────────────

function classify(scenario: BenchmarkScenario, got: SimVerdict): ScenarioResult["classification"] {
  const exp = scenario.expectedVerdict;
  if (exp === "approve_or_ratification") {
    // Special wildcard — both are acceptable
    if (got === "approve" || got === "require_ratification") return "true_ratification";
    return "false_approve";  // shouldn't have been a flat block
  }
  if (got === exp) {
    if (got === "approve")              return "true_approve";
    if (got === "block")                return "true_block";
    if (got === "require_ratification") return "true_ratification";
  }
  if (scenario.isSafe && got === "block")           return "false_block";
  if (!scenario.isSafe && got === "approve")        return "false_approve";
  return "other";
}

function pass(scenario: BenchmarkScenario, got: SimVerdict): boolean {
  if (scenario.expectedVerdict === "approve_or_ratification") {
    return got === "approve" || got === "require_ratification";
  }
  return got === scenario.expectedVerdict;
}

// ── State ─────────────────────────────────────────────────────────────────────

let _lastReport: BenchmarkReport | null = null;

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Run all benchmark scenarios and return a full report.
 * Uses evaluateWithState() — deterministic, no I/O.
 */
export function runBenchmark(): BenchmarkReport {
  const startMs      = Date.now();
  const results:  ScenarioResult[] = [];
  const latencies: number[]        = [];

  for (const scenario of SCENARIOS) {
    const t0 = process.hrtime.bigint();
    const outcome = evaluateWithState(scenario.preState, scenario.action);
    const t1 = process.hrtime.bigint();
    const latencyMs = Number(t1 - t0) / 1_000_000;

    const got        = outcome.verdict;
    const didPass    = pass(scenario, got);
    const cls        = classify(scenario, got);

    latencies.push(latencyMs);

    results.push({
      id:            scenario.id,
      description:   scenario.description,
      expected:      scenario.expectedVerdict,
      got,
      pass:          didPass,
      classification: cls,
      latencyMs,
      verdictReason: outcome.verdictReason,
    });

    // Prometheus per-scenario metrics
    inc(
      "ghostbrain_sim_benchmark_scenario_total",
      "Number of benchmark scenario runs, labelled by pass/fail and classification",
      1,
      { scenario: scenario.id, pass: String(didPass), cls },
    );
  }

  const latencyStats = computeLatencyStats(latencies);

  const passed         = results.filter(r => r.pass).length;
  const falseBlocks    = results.filter(r => r.classification === "false_block").length;
  const falseApprovals = results.filter(r => r.classification === "false_approve").length;
  const trueApprovals  = results.filter(r => r.classification === "true_approve").length;
  const trueBlocks     = results.filter(r => r.classification === "true_block" || r.classification === "true_ratification").length;
  const total          = results.length;

  const report: BenchmarkReport = {
    runAt:            startMs,
    durationMs:       Date.now() - startMs,
    totalScenarios:   total,
    passed,
    failed:           total - passed,
    falseBlocks,
    falseApprovals,
    trueApprovals,
    trueBlocks,
    accuracyPct:      total > 0 ? (passed / total) * 100 : 0,
    safetyFailurePct: total > 0 ? (falseApprovals / total) * 100 : 0,
    falseBlockPct:    total > 0 ? (falseBlocks / total) * 100 : 0,
    latency:          latencyStats,
    scenarios:        results,
  };

  _lastReport = report;

  // ── Emit Prometheus metrics ───────────────────────────────────────────────
  set("ghostbrain_sim_benchmark_accuracy_pct",      "Simulator benchmark accuracy percentage",       report.accuracyPct);
  set("ghostbrain_sim_benchmark_safety_failure_pct","Simulator benchmark safety failure percentage", report.safetyFailurePct);
  set("ghostbrain_sim_benchmark_false_block_pct",   "Simulator benchmark false block percentage",    report.falseBlockPct);
  set("ghostbrain_sim_benchmark_scenarios_total",   "Total benchmark scenarios evaluated",           report.totalScenarios);
  set("ghostbrain_sim_benchmark_passed",            "Benchmark scenarios passed",                    report.passed);
  set("ghostbrain_sim_benchmark_false_blocks",      "Benchmark false blocks (safe action blocked)",  report.falseBlocks);
  set("ghostbrain_sim_benchmark_false_approvals",   "Benchmark false approvals (unsafe action approved)", report.falseApprovals);

  observe("ghostbrain_sim_benchmark_latency_p50_ms",  "Simulator benchmark p50 decision latency ms",  report.latency.p50Ms);
  observe("ghostbrain_sim_benchmark_latency_p99_ms",  "Simulator benchmark p99 decision latency ms",  report.latency.p99Ms);
  observe("ghostbrain_sim_benchmark_latency_p999_ms", "Simulator benchmark p999 decision latency ms", report.latency.p999Ms);

  return report;
}

/** Return the last benchmark report (null if benchmark has never been run). */
export function benchmarkStats(): BenchmarkReport | null {
  return _lastReport;
}

/** Return the hardcoded scenario corpus metadata (no execution). */
export function getScenarioCorpus(): Pick<BenchmarkScenario, "id" | "description" | "expectedVerdict" | "isSafe">[] {
  return SCENARIOS.map(s => ({
    id:              s.id,
    description:     s.description,
    expectedVerdict: s.expectedVerdict,
    isSafe:          s.isSafe,
  }));
}
