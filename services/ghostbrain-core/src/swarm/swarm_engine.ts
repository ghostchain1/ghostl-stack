/**
 * GhostBrain Autonomous Swarm — Swarm Engine
 *
 * The master coordination loop.  Every 5 seconds it:
 *   1. Collects anomaly telemetry from infrastructure monitors
 *   2. Routes each detected event to a SwarmTask via TaskRouter
 *   3. Dispatches tasks to agents through the SwarmController
 *   4. Broadcasts events into GhostBrain unified memory (learning loop)
 *   5. Updates Prometheus metrics
 *
 * Registered SwarmAgents (one per domain):
 *   RepairSwarmAgent      — recovery      (container crashes, OOM)
 *   InfraSwarmAgent       — infrastructure (VM failures, disk pressure)
 *   BlockchainSwarmAgent  — blockchain    (validator issues, chain desync)
 *   SecuritySwarmAgent    — security      (threats, unauthorized access)
 *   DeploySwarmAgent      — devops        (deployments, upgrades)
 *   PerformanceSwarmAgent — performance   (CPU/mem pressure, throughput)
 *
 * Env vars:
 *   SWARM_INTERVAL_MS   — tick interval in ms (default 5000)
 *   SWARM_DRY_RUN=1     — mark all tasks dryRun=true (no side-effects)
 */

import { registerAgent, agentCount, listAgents } from "./agent_registry.js";
import { routeRaw }                               from "./task_router.js";
import { broadcastEvent }                         from "./swarm_memory_sync.js";
import {
  dispatchTask,
  swarmControllerStats,
  getRecentResults,
}                                                 from "./swarm_controller.js";
import { RepairSwarmAgent }                       from "./agents/repair_swarm_agent.js";
import { InfraSwarmAgent }                        from "./agents/infra_swarm_agent.js";
import { BlockchainSwarmAgent }                   from "./agents/blockchain_swarm_agent.js";
import { SecuritySwarmAgent }                     from "./agents/security_swarm_agent.js";
import { DeploySwarmAgent }                       from "./agents/deploy_swarm_agent.js";
import { PerformanceSwarmAgent }                  from "./agents/performance_swarm_agent.js";
import { getUnhealthyContainers }                 from "../docker_monitor.js";
import { getUnhealthyVMs }                        from "../vm_monitor.js";
import {
  getJailedValidators,
  getLowSigningValidators,
}                                                 from "../validators/validator_monitor.js";
import { set }                                    from "../observability/metrics_exporter.js";
import { log }                                    from "../observability/event_logger.js";

// ── Config ────────────────────────────────────────────────────────────────────

const SWARM_INTERVAL_MS = Number(process.env.SWARM_INTERVAL_MS ?? "5000");
const SWARM_DRY_RUN     = process.env.SWARM_DRY_RUN === "1";

// ── State ─────────────────────────────────────────────────────────────────────

let _timer:   ReturnType<typeof setInterval> | null = null;
let _cycles   = 0;
let _paused   = false;
let _started  = false;

// ── Agent registration ────────────────────────────────────────────────────────

function registerAllAgents(): void {
  registerAgent(new RepairSwarmAgent());
  registerAgent(new InfraSwarmAgent());
  registerAgent(new BlockchainSwarmAgent());
  registerAgent(new SecuritySwarmAgent());
  registerAgent(new DeploySwarmAgent());
  registerAgent(new PerformanceSwarmAgent());
  log.info("swarm_engine: agents_registered", `count=${agentCount()}`);
}

// ── Telemetry collection ──────────────────────────────────────────────────────

interface RawEvent {
  type:       string;
  resourceId: string;
  payload:    Record<string, unknown>;
}

function collectEvents(): RawEvent[] {
  const events: RawEvent[] = [];

  // Unhealthy containers (cap at 3 per tick to avoid flooding)
  for (const c of getUnhealthyContainers().slice(0, 3)) {
    events.push({
      type:       c.restarts > 3 ? "container_crash" : "container_oom",
      resourceId: c.name,
      payload:    { cpuPct: c.cpuPct, memPct: c.memPct, restarts: c.restarts },
    });
  }

  // Unhealthy VMs (cap at 2)
  for (const vm of getUnhealthyVMs().slice(0, 2)) {
    events.push({
      type:       "vm_failure",
      resourceId: vm.vmId,
      payload:    { state: vm.state, cpuPct: vm.cpuPct, memPct: vm.memPct },
    });
  }

  // Jailed validators
  for (const v of getJailedValidators().slice(0, 2)) {
    events.push({
      type:       "jailed_validator",
      resourceId: v.operatorAddress,
      payload:    { moniker: v.moniker, jailed: v.jailed },
    });
  }

  // Low-signing validators
  for (const v of getLowSigningValidators().slice(0, 2)) {
    events.push({
      type:       "missed_blocks",
      resourceId: v.operatorAddress,
      payload:    { moniker: v.moniker, signingRate: v.signingRate, missedBlocks: v.missedBlocks },
    });
  }

  return events;
}

// ── Swarm tick ────────────────────────────────────────────────────────────────

async function swarmTick(): Promise<void> {
  if (_paused) return;
  _cycles++;

  set("ghostbrain_swarm_agents_active", "Active registered swarm agents", agentCount());

  const events = collectEvents();
  for (const ev of events) {
    // Broadcast into GhostBrain memory (feeds learning layers above)
    broadcastEvent({
      type:       ev.type,
      domain:     "infrastructure", // TaskRouter refines this
      severity:   "warn",
      resourceId: ev.resourceId,
      payload:    ev.payload,
    });

    const task = routeRaw(ev.type, ev.resourceId, ev.payload);
    if (SWARM_DRY_RUN) task.dryRun = true;

    // Dispatch asynchronously — errors are caught inside dispatchTask
    void dispatchTask(task);
  }
}

// ── Lifecycle API ─────────────────────────────────────────────────────────────

export function startSwarmEngine(): void {
  if (_started) return;
  registerAllAgents();
  _timer   = setInterval(() => void swarmTick(), SWARM_INTERVAL_MS);
  _started = true;
  log.info("swarm_engine: started", `interval=${SWARM_INTERVAL_MS}ms dryRun=${SWARM_DRY_RUN}`);
}

export function stopSwarmEngine(): void {
  if (_timer) { clearInterval(_timer); _timer = null; }
  _started = false;
  log.info("swarm_engine: stopped", "coordination loop halted");
}

export function pauseSwarmEngine(): void {
  _paused = true;
  log.info("swarm_engine: paused", "tick loop suspended");
}

export function resumeSwarmEngine(): void {
  _paused = false;
  log.info("swarm_engine: resumed", "tick loop active");
}

export function swarmEngineStats() {
  return {
    started:    _started,
    paused:     _paused,
    cycles:     _cycles,
    dryRun:     SWARM_DRY_RUN,
    intervalMs: SWARM_INTERVAL_MS,
    agents:     listAgents(),
    ...swarmControllerStats(),
  };
}

export { getRecentResults as getRecentSwarmResults };
