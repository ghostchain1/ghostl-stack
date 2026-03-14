/**
 * GhostBrain AI Kernel — Kernel Engine  (Layer 6)
 *
 * The lowest-level autonomous control loop.  Every KERNEL_LOOP_MS (default
 * 5 s) the engine:
 *
 *   1. Calls ResourceController.rebalance() to derive KernelCommands from
 *      current InfraMemory metrics.
 *   2. Dispatches each command through the CommandBus (SafetyGuard runs
 *      inside dispatch — all commands validated before execution).
 *   3. Records results in the in-process ring buffer + PostgreSQL audit log.
 *   4. Increments Prometheus counters so every kernel action is observable.
 *
 * Handler registration (DockerManager, VMManager, SystemManager) happens
 * exactly once at startKernelEngine() and is guarded against duplicates.
 *
 * Env vars:
 *   KERNEL_LOOP_MS=5000    Tick interval in milliseconds (default 5 s)
 *   KERNEL_DRY_RUN=1       Force all commands dry-run (no writes to infra)
 *
 * Layer ordering:
 *   Layer 6  Kernel Engine (this file — infrastructure actuator)
 *   Layer 5  HyperCore    (strategic reasoning, feeds signals upward)
 *   Layer 4  Cognitive Engine
 *   Layer 3  Prediction Engine
 *   Layer 2  Neural Memory
 *   Layer 1  Monitoring + Telemetry
 */

import { registerHandler, dispatch, commandBusStats } from "./command_bus.js";
import { dockerManager, dockerManagerStats }           from "./docker_manager.js";
import { vmManager,     vmManagerStats }               from "./vm_manager.js";
import { systemManager, systemManagerStats }           from "./system_manager.js";
import { rebalance,     resourceControllerStats }      from "./resource_controller.js";
import { safetyGuardStats }                            from "./safety_guard.js";
import { log }                                         from "../observability/event_logger.js";
import { inc }                                         from "../observability/metrics_exporter.js";

// ── Config ────────────────────────────────────────────────────────────────────

const LOOP_MS  = Number(process.env.KERNEL_LOOP_MS ?? "5000");
const DRY_RUN  = process.env.KERNEL_DRY_RUN === "1";

// ── State ─────────────────────────────────────────────────────────────────────

let _interval:  ReturnType<typeof setInterval> | null = null;
let _running    = false;
let _paused     = false;
let _tickCount  = 0;
let _lastTickAt = 0;
let _cmdTotal   = 0;
let _cmdOk      = 0;
let _cmdBlocked = 0;

// Result ring buffer — surfaced via REST for observability
interface KernelTickResult {
  cmdId:   string;
  type:    string;
  action:  string;
  target?: string;
  ok:      boolean;
  dryRun:  boolean;
  ts:      number;
}
const _recentResults: KernelTickResult[] = [];
const MAX_RECENT = 200;

// ── Core tick ─────────────────────────────────────────────────────────────────

async function tick(): Promise<void> {
  if (!_running || _paused) return;
  _tickCount++;
  _lastTickAt = Date.now();

  try {
    const commands = rebalance();
    _cmdTotal += commands.length;

    for (const cmd of commands) {
      // Honour the force-dry-run env override
      if (DRY_RUN) cmd.dryRun = true;

      const result = await dispatch(cmd);

      if (result.ok) {
        _cmdOk++;
      } else if (result.detail?.startsWith("BLOCKED")) {
        _cmdBlocked++;
      }

      if (_recentResults.length >= MAX_RECENT) _recentResults.shift();
      _recentResults.push({
        cmdId:  result.commandId,
        type:   cmd.type,
        action: cmd.action,
        target: cmd.target,
        ok:     result.ok,
        dryRun: result.dryRun,
        ts:     result.executedAt,
      });
    }

    inc("ghostbrain_kernel_ticks", "Kernel engine ticks", 1);
    if (commands.length > 0) {
      log.debug(
        "kernel_engine: tick",
        `cmds=${commands.length} ok=${_cmdOk} blocked=${_cmdBlocked}`,
      );
    }
  } catch (err) {
    log.error("kernel_engine: tick_error", String(err));
  }
}

// ── Lifecycle ─────────────────────────────────────────────────────────────────

export function startKernelEngine(): void {
  if (_interval) return;   // already running

  // Register all handlers exactly once (registerHandler is idempotent)
  registerHandler(dockerManager);
  registerHandler(vmManager);
  registerHandler(systemManager);

  _running  = true;
  _paused   = false;
  _interval = setInterval(() => void tick(), LOOP_MS);

  log.info("kernel_engine: started", `loopMs=${LOOP_MS} dryRun=${DRY_RUN}`);
}

export function stopKernelEngine(): void {
  if (_interval) { clearInterval(_interval); _interval = null; }
  _running = false;
  log.info("kernel_engine: stopped", "");
}

export function pauseKernelEngine(): void {
  _paused = true;
  log.info("kernel_engine: paused", "");
}

export function resumeKernelEngine(): void {
  _paused = false;
  log.info("kernel_engine: resumed", "");
}

// ── Query API ─────────────────────────────────────────────────────────────────

export function getRecentKernelResults(n = 50): KernelTickResult[] {
  return _recentResults.slice(-Math.min(n, MAX_RECENT));
}

export function kernelEngineStats(): {
  running:    boolean;
  paused:     boolean;
  ticks:      number;
  lastTickAt: number;
  loopMs:     number;
  dryRun:     boolean;
  commands:   { total: number; ok: number; blocked: number };
  bus:        ReturnType<typeof commandBusStats>;
  docker:     ReturnType<typeof dockerManagerStats>;
  vm:         ReturnType<typeof vmManagerStats>;
  system:     ReturnType<typeof systemManagerStats>;
  resources:  ReturnType<typeof resourceControllerStats>;
  safety:     ReturnType<typeof safetyGuardStats>;
} {
  return {
    running:    _running,
    paused:     _paused,
    ticks:      _tickCount,
    lastTickAt: _lastTickAt,
    loopMs:     LOOP_MS,
    dryRun:     DRY_RUN,
    commands:   { total: _cmdTotal, ok: _cmdOk, blocked: _cmdBlocked },
    bus:        commandBusStats(),
    docker:     dockerManagerStats(),
    vm:         vmManagerStats(),
    system:     systemManagerStats(),
    resources:  resourceControllerStats(),
    safety:     safetyGuardStats(),
  };
}
