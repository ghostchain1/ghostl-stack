/**
 * GhostBrain Core — Infrastructure Supervisor
 *
 * Top-level orchestrator that ties together:
 *   - Hypervisor / VM / Docker collection (existing controllers)
 *   - GhostBrain Predictive Engine (EWMA forecast + anomaly + failure prediction)
 *   - Crash prevention and threshold monitoring
 *   - Autonomous resource rebalancing via OS signals
 *   - Self-healing via container restart / memory flush
 *
 * Routing law enforced: all chain checks follow L3 → L2 → L1.
 * No execution decisions are made here; the supervisor raises events into
 * the kernel event bus (kernel/event_loop.ts) for coordinated handling.
 *
 * Lifecycle:
 *   startInfraSupervisor()   — start all loops
 *   stopInfraSupervisor()    — graceful shutdown
 *   infraSupervisorStats()   — observability snapshot
 */

import { exec }                   from "node:child_process";
import { promisify }              from "node:util";

import { collectVmSnapshots }     from "./vm_controller.js";
import { collectDockerSnapshots, containerHealth } from "./docker_controller.js";
import { metrics as hypervisorMetrics, runObserveCycle } from "./hypervisor_controller.js";

import { startPredictiveEngine, stopPredictiveEngine, predictiveEngineStats }
  from "../predictive/index.js";
import { emitBrainEvent, onBrainEvent } from "../kernel/event_loop.js";
import { getActiveRisks }         from "../predictive/failure_predictor.js";
import { getRecommendations }     from "../predictive/predictive_balancer.js";
import { recordFixResult }         from "../memory/fix_memory.js";
import { recordOptimization }     from "../memory/performance_memory.js";
import { evaluateProposedAction } from "../simulator/index.js";
import { evaluatePolicy, isActionPermitted, recordActionExecuted }
  from "../kernel/policy_engine.js";

const execAsync = promisify(exec);

// ── Config ────────────────────────────────────────────────────────────────────

const SUPERVISOR_TICK_MS     = Number(process.env.SUPERVISOR_TICK_MS       ?? "15000");
const THRESHOLD_CPU_CRITICAL = Number(process.env.SUPERVISOR_CPU_CRITICAL  ?? "90");
const THRESHOLD_MEM_CRITICAL = Number(process.env.SUPERVISOR_MEM_CRITICAL  ?? "85");
const THRESHOLD_CPU_WARN     = Number(process.env.SUPERVISOR_CPU_WARN      ?? "75");
const THRESHOLD_MEM_WARN     = Number(process.env.SUPERVISOR_MEM_WARN      ?? "70");
const AUTO_RESTART_ENABLED   = process.env.SUPERVISOR_AUTO_RESTART !== "false";
const LOG_LEVEL              = process.env.SUPERVISOR_LOG ?? "info";

// Known GhostStack containers we track by name prefix
const GHOSTSTACK_CONTAINERS = [
  "ghostchain",
  "ghostl2",
  "ghostl3",
  "ghostbrain",
  "ghost-ai",
  "ghost-indexer",
  "ghost-api",
  "ghost-worker",
];

// ── State ─────────────────────────────────────────────────────────────────────

let _running          = false;
let _supervisorTimer: ReturnType<typeof setInterval> | null = null;
let _supervisorTicks  = 0;
let _autoActions      = 0;
let _selfHealCount    = 0;

// ── Logging ───────────────────────────────────────────────────────────────────

function log(level: "debug" | "info" | "warn" | "error", msg: string, meta?: object): void {
  if (level === "debug" && LOG_LEVEL !== "debug") return;
  const line = JSON.stringify({
    ts: new Date().toISOString(),
    service: "ghostbrain-infra-supervisor",
    level, msg, ...meta,
  });
  if (level === "warn" || level === "error") process.stderr.write(line + "\n");
  else                                       process.stdout.write(line + "\n");
}

// ── Threshold checks ──────────────────────────────────────────────────────────

function assessThresholds(cpuPct: number, memPct: number, source: string): void {
  if (cpuPct >= THRESHOLD_CPU_CRITICAL) {
    emitBrainEvent("THRESHOLD_BREACH", { source, metric: "cpu", value: cpuPct, level: "critical" });
    log("warn", "CPU critical threshold", { source, cpuPct });
  } else if (cpuPct >= THRESHOLD_CPU_WARN) {
    emitBrainEvent("THRESHOLD_BREACH", { source, metric: "cpu", value: cpuPct, level: "warn" });
  }

  if (memPct >= THRESHOLD_MEM_CRITICAL) {
    emitBrainEvent("THRESHOLD_BREACH", { source, metric: "mem", value: memPct, level: "critical" });
    emitBrainEvent("MEMORY_PRESSURE",  { source, memPct, level: "critical" });
    log("warn", "Memory critical threshold", { source, memPct });
  } else if (memPct >= THRESHOLD_MEM_WARN) {
    emitBrainEvent("MEMORY_PRESSURE",  { source, memPct, level: "warn" });
  }
}

// ── Self-healing actions ──────────────────────────────────────────────────────

/**
 * Attempt to restart an unhealthy container.
 * Only acts on containers whose names match GHOSTSTACK_CONTAINERS patterns.
 */
async function selfHealContainer(name: string, reason: string): Promise<void> {
  const isGhostContainer = GHOSTSTACK_CONTAINERS.some(p => name.includes(p));
  if (!isGhostContainer || !AUTO_RESTART_ENABLED) return;

  // ── Policy + Simulator gate ───────────────────────────────────────────────
  const action = { type: "restart_container" as const, targetId: name, requestedBy: "supervisor" as const, urgency: "high" as const };
  const policy = evaluatePolicy(action.type, name, action.requestedBy);

  if (policy.permission === "forbidden") {
    log("warn", "Self-heal blocked by policy (forbidden)", { name, reason: policy.reason });
    return;
  }
  if (policy.permission === "require_ratification") {
    log("warn", "Self-heal deferred — requires governance ratification", { name, reason: policy.reason });
    emitBrainEvent("RECOVERY_NEEDED", { container: name, reason, deferred: true, policy: policy.permission });
    return;
  }

  if (policy.permission === "simulate_first") {
    const outcome = await evaluateProposedAction(action);
    if (!isActionPermitted(policy.permission, outcome.verdict)) {
      log("warn", "Self-heal blocked by simulation", { name, verdict: outcome.verdict, verdictReason: outcome.verdictReason });
      return;
    }
    log("info", "Simulation approved self-heal", { name, verdict: outcome.verdict });
  }
  // ── Execute (autonomous or simulation-approved) ───────────────────────────

  _selfHealCount++;
  log("warn", "Self-healing: restarting container", { name, reason });

  try {
    await execAsync(`docker restart ${name}`, { timeout: 30_000 });
    recordActionExecuted();
    recordFixResult(
      `container_unhealthy:${name}`,
      "docker_restart",
      "docker_restart",
      { reason, autoHealed: true },
      true,
      0,
    );
    _autoActions++;
    log("info", "Container restarted", { name });
  } catch (err) {
    log("error", "Container restart failed", { name, error: String(err) });
  }
}

/**
 * Drop OOM-invulnerable Docker container memory limits temporarily.
 * Used when host memory is critically pressured.
 */
async function applyMemoryPressureRelief(): Promise<void> {
  log("info", "Applying memory pressure relief — compacting Docker memory limits");
  try {
    // Get running container IDs
    const { stdout } = await execAsync(
      "docker ps --filter status=running --format '{{.Names}} {{.ID}}'",
      { timeout: 5_000 },
    );

    const lines = stdout.trim().split("\n").filter(Boolean);
    for (const line of lines) {
      const [name, id] = line.split(" ");
      if (!name || !id) continue;
      const isGhost = GHOSTSTACK_CONTAINERS.some(p => name.includes(p));
      if (!isGhost) continue;

      // Update non-critical containers to soft memory limit
      if (!name.includes("ghostchain") && !name.includes("ghostl2") && !name.includes("ghostl3")) {
        try {
          // Sim gate for memory throttle
          const memAction = { type: "throttle_container_mem" as const, targetId: name, params: { memLimitMb: 512 }, requestedBy: "supervisor" as const, urgency: "medium" as const };
          const memPolicy = evaluatePolicy(memAction.type, name, memAction.requestedBy);
          if (memPolicy.permission === "forbidden" || memPolicy.permission === "require_ratification") {
            log("info", "Memory throttle deferred by policy", { name, permission: memPolicy.permission });
            continue;
          }
          if (memPolicy.permission === "simulate_first") {
            const memOutcome = await evaluateProposedAction(memAction);
            if (!isActionPermitted(memPolicy.permission, memOutcome.verdict)) {
              log("info", "Memory throttle blocked by simulation", { name, verdict: memOutcome.verdict });
              continue;
            }
          }
          await execAsync(`docker update --memory 512m --memory-swap 1g ${id}`, { timeout: 5_000 });
          recordActionExecuted();
          _autoActions++;
          log("info", "Container memory soft-capped", { name, id });
        } catch { /* non-fatal */ }
      }
    }

    recordOptimization({
      resourceId:  "host",
      optType:     "memory_limit",
      before:      {},
      after:       { containersUpdated: lines.length },
      improvement: 1,
      note:        "memory_pressure_relief: docker container limits reduced",
    });
  } catch (err) {
    log("error", "Memory pressure relief failed", { error: String(err) });
  }
}

// ── Supervisor observation cycle ──────────────────────────────────────────────

async function supervisorTick(): Promise<void> {
  if (!_running) return;
  _supervisorTicks++;

  try {
    // 1. Run the full hypervisor observe cycle (VM + Docker + chain health)
    const cycle = await runObserveCycle();

    // 2. Quick threshold assessment on VM data
    for (const vm of (cycle as any).vmStats ?? []) {
      assessThresholds(vm.cpuPct ?? 0, vm.memPct ?? 0, `vm:${vm.name ?? "unknown"}`);
    }

    // 3. Check Docker container health for GhostStack services
    const docker = await collectDockerSnapshots();
    if (docker.errors > 0) {
      log("warn", "Docker collection errors", { errors: docker.errors });
    }

    // 4. Assess imminent failure predictions from predictive engine
    const risks = getActiveRisks("high");
    for (const risk of risks) {
      log("warn", "Active failure risk", { resourceId: risk.resourceId, risk: risk.risk, score: risk.score });
    }

    // 5. Act on pending balance recommendations (migrate → event; throttle → docker update)
    const recs = getRecommendations(true).filter(r => r.urgencyScore >= 80);
    for (const rec of recs.slice(0, 3)) {
      emitBrainEvent("REBALANCE_NEEDED", { source: "infra-supervisor", ...rec });
    }

    // Update shared metrics (used by Prometheus scrape in hypervisor_controller)
    hypervisorMetrics.aiActionsTotal = _autoActions;

    log("debug", "Supervisor tick complete", {
      tick: _supervisorTicks,
      dockerErrors: docker.errors,
      activeRisks: risks.length,
      pendingRecs: recs.length,
    });

  } catch (err) {
    log("error", "Supervisor tick error", { error: String(err) });
  }
}

// ── Kernel event handlers ─────────────────────────────────────────────────────

function registerEventHandlers(): void {
  // Memory pressure → apply relief
  onBrainEvent<{ memPct: number; level: string }>("MEMORY_PRESSURE", async (ev) => {
    const p = ev.payload as any;
    if (p?.level === "critical") {
      await applyMemoryPressureRelief();
    }
  });

  // Crash predicted → evaluate self-heal
  onBrainEvent<{ container?: string; risk: string }>("CRASH_PREDICTED", async (ev) => {
    const p = ev.payload as any;
    if (p?.container && p?.risk === "imminent") {
      await selfHealContainer(p.container, "crash_imminent_prediction");
    }
  });

  // Recovery needed → restart unhealthy ghost containers
  onBrainEvent("RECOVERY_NEEDED", async (ev) => {
    const p = ev.payload as any;
    if (p?.container) {
      await selfHealContainer(p.container, "recovery_requested");
    }
  });
}

// ── Lifecycle ─────────────────────────────────────────────────────────────────

export function startInfraSupervisor(): void {
  if (_running) return;
  _running = true;

  // Register event handlers
  registerEventHandlers();

  // Start predictive engine (drives EWMA + anomaly + failure prediction)
  startPredictiveEngine();

  // Supervisor loop (heavier — runs every 15 s by default)
  _supervisorTimer = setInterval(() => { void supervisorTick(); }, SUPERVISOR_TICK_MS);

  log("info", "GhostBrain Infrastructure Supervisor started", {
    supervisorTickMs: SUPERVISOR_TICK_MS,
    autoRestart: AUTO_RESTART_ENABLED,
  });
}

export function stopInfraSupervisor(): void {
  if (!_running) return;
  _running = false;

  if (_supervisorTimer) { clearInterval(_supervisorTimer); _supervisorTimer = null; }
  stopPredictiveEngine();

  log("info", "GhostBrain Infrastructure Supervisor stopped");
}

export function infraSupervisorStats() {
  return {
    running:       _running,
    ticks:         _supervisorTicks,
    autoActions:   _autoActions,
    selfHealCount: _selfHealCount,
    predictive:    predictiveEngineStats(),
    hypervisor:    { ...hypervisorMetrics },
    thresholds: {
      cpuCritical: THRESHOLD_CPU_CRITICAL,
      memCritical: THRESHOLD_MEM_CRITICAL,
      cpuWarn:     THRESHOLD_CPU_WARN,
      memWarn:     THRESHOLD_MEM_WARN,
    },
  };
}
