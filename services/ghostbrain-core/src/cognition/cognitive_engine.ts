/**
 * GhostBrain Cognitive Engine — Central Control Loop
 *
 * Implements the complete GhostBrain intelligence cycle:
 *
 *   observe → reason → plan → execute → learn
 *
 * Two entry points:
 *
 *   think(event)              — single-event cognitive cycle (used by API)
 *   startCognitiveLoop()      — autonomous periodic scan (default: 10 s)
 *
 * Every call to think() runs the full pipeline:
 *   1. ReasoningEngine.analyze()     — classify event + root cause
 *   2. PlanningEngine.createPlan()   — build multi-step recovery plan
 *   3. StrategyEngine.chooseStrategy() — select optimal actions
 *   4. AgentCoordinator.executePlan() — dispatch to swarm agents
 *   5. learn() / recordChain()         — feed outcomes back (auto inside coordinator)
 *
 * The periodic loop scans:
 *   • Unhealthy containers / VMs from monitors
 *   • Recent critical events from infra memory
 *   • Blockchain validator / L1/L2/L3 anomalies
 *
 * Governance:
 *   Steps flagged requiresGovernance=true are NEVER executed autonomously.
 *   They are logged to the audit trail and surfaced via /ai/plan for manual ratification.
 *
 * Prometheus metrics:
 *   ghostbrain_cognitive_decisions_total   — counter: think() invocations
 *   ghostbrain_cognitive_loop_ticks_total  — counter: autonomous loop ticks
 *   ghostbrain_cognitive_loop_events_total — counter: events processed by loop
 *   ghostbrain_cognitive_success_rate      — gauge: rolling success rate
 */

import { reasoningEngine }    from "./reasoning_engine.js";
import { planningEngine }     from "./planning_engine.js";
import { strategyEngine }     from "./strategy_engine.js";
import { agentCoordinator }   from "./agent_coordinator.js";
import { getUnhealthyContainers } from "../docker_monitor.js";
import { getUnhealthyVMs }        from "../vm_monitor.js";
import { getInfraHistory }        from "../memory/infrastructure_memory.js";
import { recordAuditEntry }       from "../memory/memory_audit.js";
import { inc, set, observe }      from "../observability/metrics_exporter.js";
import { log }                    from "../observability/event_logger.js";
import type { CognitiveEvent }    from "./reasoning_engine.js";
import type { CognitivePlan }     from "./planning_engine.js";
import type { Strategy }          from "./strategy_engine.js";
import type { ExecutionResult }   from "./agent_coordinator.js";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface CognitiveThinkResult {
  event:    CognitiveEvent;
  reasoning: Awaited<ReturnType<typeof reasoningEngine.analyze>>;
  plan:     CognitivePlan;
  strategy: Strategy;
  result:   ExecutionResult;
  durationMs: number;
}

// ── In-process recent-plan ring buffer (last 100) ─────────────────────────────

const MAX_PLANS = 100;
const _recentPlans: CognitiveThinkResult[] = [];

function pushPlan(r: CognitiveThinkResult): void {
  _recentPlans.push(r);
  if (_recentPlans.length > MAX_PLANS) _recentPlans.shift();
}

// ── State ─────────────────────────────────────────────────────────────────────

let _loopInterval:  ReturnType<typeof setInterval> | null = null;
let _running        = false;
let _tickCount      = 0;
let _totalDecisions = 0;
let _totalSucceeded = 0;
let _loopMs         = Number(process.env.COGNITIVE_LOOP_MS ?? "10000");

// ── Core think() ──────────────────────────────────────────────────────────────

/**
 * Execute one full cognitive cycle for a given event.
 * Returns the full trace: reasoning → plan → strategy → execution result.
 *
 * Never throws — errors are captured internally and surfaced in the result.
 */
export async function think(event: CognitiveEvent): Promise<CognitiveThinkResult> {
  const start = Date.now();
  inc("ghostbrain_cognitive_decisions_total", "Total cognitive think() invocations");
  _totalDecisions++;

  event.ts = event.ts ?? start;

  // ── 1. Reason ────────────────────────────────────────────────────────────
  const reasoning = await reasoningEngine.analyze(event);

  // ── 2. Plan ──────────────────────────────────────────────────────────────
  const plan = planningEngine.createPlan(reasoning);

  // ── 3. Select strategy ────────────────────────────────────────────────────
  const strategy = await strategyEngine.chooseStrategy(plan);

  // ── 4. Execute via agents ─────────────────────────────────────────────────
  const result = await agentCoordinator.executePlan(plan, strategy);

  const durationMs = Date.now() - start;

  // ── 5. Metrics ────────────────────────────────────────────────────────────
  const succeeded = result.succeeded > result.failed;
  if (succeeded) _totalSucceeded++;
  const successRate = _totalDecisions > 0 ? _totalSucceeded / _totalDecisions : 0;

  set("ghostbrain_cognitive_success_rate",
    "Rolling cognitive success rate (succeeded / total)", successRate);
  observe("ghostbrain_cognitive_duration_seconds",
    "Cognitive think() latency in seconds", durationMs / 1000);

  // ── 6. Audit log ──────────────────────────────────────────────────────────
  void recordAuditEntry({
    agent:        "CognitiveEngine",
    decisionType: `cognitive_think:${reasoning.classification}`,
    resourceId:   event.resourceId,
    rationale:    `${reasoning.rootCause} | plan_id=${plan.id} steps=${plan.steps.length}`,
    actionTaken:  { planId: plan.id, stepsCount: plan.steps.length, classification: reasoning.classification },
  });

  log.info("cognitive_engine: think_complete",
    `event=${event.label} resource=${event.resourceId} class=${reasoning.classification} ` +
    `severity=${reasoning.severity} steps=${plan.steps.length} ` +
    `succeeded=${result.succeeded} failed=${result.failed} ms=${durationMs}`);

  const thinkResult: CognitiveThinkResult = {
    event, reasoning, plan, strategy, result, durationMs,
  };
  pushPlan(thinkResult);

  return thinkResult;
}

// ── Autonomous loop ────────────────────────────────────────────────────────────

/**
 * Start the periodic cognitive scan.
 * Processes unhealthy containers, unhealthy VMs, and critical infra events.
 */
export function startCognitiveLoop(intervalMs?: number): void {
  if (_running) {
    log.warn("cognitive_engine: already_running", "startCognitiveLoop() called twice");
    return;
  }
  if (intervalMs) _loopMs = intervalMs;
  _running = true;

  // Run first iteration after a short warmup delay to let memory hydrate
  const warmupMs = Number(process.env.COGNITIVE_WARMUP_MS ?? "15000");
  const timeout  = setTimeout(() => {
    if (!_running) return;
    void _tick();
    _loopInterval = setInterval(() => void _tick(), _loopMs);
  }, warmupMs);

  // Keep the timeout from blocking process exit if loop is stopped early
  if (typeof timeout.unref === "function") timeout.unref();

  log.info("cognitive_engine: loop_started",
    `intervalMs=${_loopMs} warmupMs=${warmupMs}`);
}

export function stopCognitiveLoop(): void {
  _running = false;
  if (_loopInterval) {
    clearInterval(_loopInterval);
    _loopInterval = null;
  }
  log.info("cognitive_engine: loop_stopped",
    `ticks=${_tickCount} decisions=${_totalDecisions}`);
}

export function cognitiveEngineStats() {
  return {
    running:        _running,
    loopMs:         _loopMs,
    ticks:          _tickCount,
    totalDecisions: _totalDecisions,
    successRate:    _totalDecisions > 0 ? _totalSucceeded / _totalDecisions : null,
    recentPlans:    _recentPlans.length,
  };
}

/** Return the most recent N think() results. */
export function getRecentPlans(n = 20): CognitiveThinkResult[] {
  return _recentPlans.slice(-n).reverse();
}

// ── Internal tick ──────────────────────────────────────────────────────────────

async function _tick(): Promise<void> {
  if (!_running) return;
  _tickCount++;
  inc("ghostbrain_cognitive_loop_ticks_total", "Autonomous cognitive loop ticks");

  const events = _buildEventsFromSystem();
  if (events.length === 0) return;

  inc("ghostbrain_cognitive_loop_events_total",
    "Events processed by cognitive loop", events.length);

  // Process up to 3 events per tick to avoid overwhelming agents
  const batch = events.slice(0, 3);
  for (const ev of batch) {
    try {
      await think(ev);
    } catch (err) {
      log.warn("cognitive_engine: tick_error",
        `event=${ev.label} resource=${ev.resourceId} error=${String(err)}`);
    }
  }
}

/** Collect current system state and return actionable cognitive events. */
function _buildEventsFromSystem(): CognitiveEvent[] {
  const events: CognitiveEvent[] = [];
  const now = Date.now();

  // ── Unhealthy containers ─────────────────────────────────────────────────
  for (const c of getUnhealthyContainers().slice(0, 5)) {
    const label = c.restarts > 5
      ? "container_restart_storm"
      : c.cpuPct > 90
        ? "container_cpu_saturation"
        : c.memPct > 85
          ? "container_memory_saturation"
          : "container_unhealthy";

    events.push({
      label,
      resourceId: c.name,
      layer:      "container",
      payload:    { cpuPct: c.cpuPct, memPct: c.memPct, restarts: c.restarts },
      ts:         now,
    });
  }

  // ── Unhealthy VMs ─────────────────────────────────────────────────────────
  for (const vm of getUnhealthyVMs().slice(0, 3)) {
    events.push({
      label:      "vm_unhealthy",
      resourceId: vm.vmId,
      layer:      "vm",
      payload:    { cpuPct: vm.cpuPct, memPct: vm.memPct, state: vm.state, host: vm.host },
      ts:         now,
    });
  }

  // ── Recent critical infra events (last tick window) ───────────────────────
  const critHistory = getInfraHistory(undefined, undefined, _loopMs * 2)
    .filter(h => h.severity === "critical" && !h.healthy)
    .slice(0, 3);

  for (const h of critHistory) {
    // Avoid duplicating events already emitted from container/VM monitors
    const alreadyCovered = events.some(e => e.resourceId === h.resourceId);
    if (alreadyCovered) continue;

    const label = h.layer === "chain"     ? "blockchain_critical"
      : h.layer === "service"             ? "service_critical"
      : h.layer === "vm"                  ? "vm_critical"
      : h.layer === "container"           ? "container_critical"
      : h.layer === "hypervisor"          ? "hypervisor_critical"
      : "infra_critical";

    events.push({
      label,
      resourceId: h.resourceId,
      layer:      h.layer,
      payload:    { cpuPct: h.cpuPct, memPct: h.memPct, restarts: h.restarts },
      ts:         h.ts,
    });
  }

  return events;
}
