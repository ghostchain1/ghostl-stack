/**
 * GhostBrain Kernel — Command Bus
 *
 * Central typed dispatcher for all kernel infrastructure commands.
 * Every command is routed through the bus, which enforces:
 *
 *   1. SafetyGuard.validate()  — blocks unsafe / rate-limited commands
 *   2. Handler routing          — first handler whose canHandle() returns true
 *   3. Persistent audit log     — ghostbrain_kernel_log (PostgreSQL)
 *   4. Structured result        — KernelResult returned to caller
 *
 * Handlers (DockerManager, VMManager, SystemManager) register themselves via
 * registerHandler() at kernel startup.  The bus is stateless beyond its
 * handler registry and counters — it holds no mutable infrastructure state.
 *
 * Thread-safety note: Node.js single-threaded event loop; concurrent awaits
 * are safe.
 */

import { randomUUID }  from "node:crypto";
import { validate }    from "./safety_guard.js";
import { log }         from "../observability/event_logger.js";
import { getPool }     from "../db/postgres_client.js";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface KernelCommand {
  /** Auto-generated UUID if omitted. */
  id?:         string;
  /** Target subsystem. */
  type:        "docker" | "vm" | "system" | "resource";
  /** Action within the subsystem — validated by SafetyGuard. */
  action:      string;
  /** Container name, VM name, or resource ID.  Validated by SafetyGuard. */
  target?:     string;
  /** Action-specific parameters (safe, structured — never concatenated to a shell). */
  params?:     Record<string, unknown>;
  /**
   * Identity of the requester for the audit log.
   * e.g. "resource_controller" | "hypercore" | "cognitive" | "api"
   */
  requestedBy: string;
  /** When true the handler performs a read-only simulation and notes what it would do. */
  dryRun?:     boolean;
}

export interface KernelResult {
  commandId:  string;
  ok:         boolean;
  detail?:    string;
  executedAt: number;
  durationMs: number;
  dryRun:     boolean;
}

export interface KernelHandler {
  canHandle(cmd: KernelCommand): boolean;
  execute(cmd: KernelCommand): Promise<KernelResult>;
}

// ── Handler registry ──────────────────────────────────────────────────────────

const _handlers: KernelHandler[] = [];

export function registerHandler(handler: KernelHandler): void {
  // Avoid duplicate registration (idempotent — safe to call multiple times)
  if (!_handlers.includes(handler)) _handlers.push(handler);
}

// ── Counters ──────────────────────────────────────────────────────────────────

let _dispatched = 0;
let _approved   = 0;
let _blocked    = 0;
let _errors     = 0;

// ── Persistent kernel audit log ───────────────────────────────────────────────

async function persistLog(cmd: KernelCommand, result: KernelResult): Promise<void> {
  const pool = getPool();
  if (!pool) return;
  try {
    await pool.query(
      `INSERT INTO ghostbrain_kernel_log
         (id, command_type, action, target, result_ok, detail,
          dry_run, requested_by, duration_ms, executed_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, to_timestamp($10::double precision / 1000))`,
      [
        result.commandId,
        cmd.type,
        cmd.action,
        cmd.target   ?? null,
        result.ok,
        result.detail ?? null,
        result.dryRun,
        cmd.requestedBy,
        result.durationMs,
        result.executedAt,
      ],
    );
  } catch (err) {
    log.warn("command_bus: persist_log_failed", String(err));
  }
}

// ── Dispatcher ────────────────────────────────────────────────────────────────

export async function dispatch(cmd: KernelCommand): Promise<KernelResult> {
  const commandId = cmd.id ?? randomUUID();
  const startedAt = Date.now();
  _dispatched++;

  const fullCmd: KernelCommand = { ...cmd, id: commandId };

  // ── 1. Safety gate — always the first check ────────────────────────────────
  const safety = validate(fullCmd);
  if (!safety.ok) {
    _blocked++;
    const result: KernelResult = {
      commandId,
      ok:         false,
      detail:     `BLOCKED: ${safety.reason}`,
      executedAt: startedAt,
      durationMs: 0,
      dryRun:     cmd.dryRun ?? false,
    };
    log.warn(
      "command_bus: blocked",
      `${cmd.type}:${cmd.action} target=${cmd.target ?? "(none)"} reason=${safety.reason}`,
    );
    void persistLog(fullCmd, result);
    return result;
  }

  // ── 2. Route to handler ────────────────────────────────────────────────────
  const handler = _handlers.find(h => h.canHandle(fullCmd));
  if (!handler) {
    _errors++;
    const result: KernelResult = {
      commandId,
      ok:         false,
      detail:     `No registered handler for type="${cmd.type}"`,
      executedAt: startedAt,
      durationMs: 0,
      dryRun:     cmd.dryRun ?? false,
    };
    log.warn("command_bus: no_handler", `type=${cmd.type}`);
    void persistLog(fullCmd, result);
    return result;
  }

  // ── 3. Execute ─────────────────────────────────────────────────────────────
  try {
    const result   = await handler.execute(fullCmd);
    result.dryRun  = cmd.dryRun ?? false;
    _approved++;
    log.info(
      "command_bus: executed",
      `${cmd.type}:${cmd.action} target=${cmd.target ?? "(none)"} ok=${result.ok} durationMs=${result.durationMs}`,
    );
    void persistLog(fullCmd, result);
    return result;
  } catch (err) {
    _errors++;
    const result: KernelResult = {
      commandId,
      ok:         false,
      detail:     (err as Error).message,
      executedAt: startedAt,
      durationMs: Date.now() - startedAt,
      dryRun:     cmd.dryRun ?? false,
    };
    log.error("command_bus: handler_threw", `${cmd.type}:${cmd.action} err=${result.detail}`);
    void persistLog(fullCmd, result);
    return result;
  }
}

// ── Stats ──────────────────────────────────────────────────────────────────────

export function commandBusStats(): {
  dispatched: number;
  approved:   number;
  blocked:    number;
  errors:     number;
  handlers:   number;
} {
  return {
    dispatched: _dispatched,
    approved:   _approved,
    blocked:    _blocked,
    errors:     _errors,
    handlers:   _handlers.length,
  };
}
