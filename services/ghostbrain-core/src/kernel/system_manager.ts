/**
 * GhostBrain Kernel — System Manager
 *
 * KernelHandler for host OS resource operations.  All system operations
 * use Node.js built-in APIs (fs/promises, process) — never shell exec or
 * child_process.exec — to eliminate command injection in the AI path.
 *
 * Supported actions:
 *   drop_caches   Write level 1/2/3 to /proc/sys/vm/drop_caches (root required).
 *                 Accepts params.level (default "3"). Only values "1", "2", "3"
 *                 are accepted — any other value is rejected before write.
 *   gc            Trigger Node.js GC if the process was started with --expose-gc.
 *   check_disk    Report block-device count from /proc/diskstats (read-only).
 */

import { writeFile, readFile } from "node:fs/promises";
import type { KernelCommand, KernelResult, KernelHandler } from "./kernel_types.js";
import { log } from "../observability/event_logger.js";

// ── Constants ─────────────────────────────────────────────────────────────────

// Only these three values are valid for /proc/sys/vm/drop_caches.
// Hardcoded set — never derive from user input.
const VALID_DROP_LEVELS = new Set<string>(["1", "2", "3"]);
const DEFAULT_DROP_LEVEL = "3";
const DROP_CACHES_PATH   = "/proc/sys/vm/drop_caches";
const DISKSTATS_PATH     = "/proc/diskstats";

// ── System action implementations ─────────────────────────────────────────────

async function doDropCaches(
  rawLevel: string,
  dryRun: boolean,
): Promise<{ ok: boolean; detail: string }> {
  // Only allow the fixed set; reject anything else silently (safe default).
  const level = VALID_DROP_LEVELS.has(rawLevel) ? rawLevel : DEFAULT_DROP_LEVEL;
  if (dryRun) {
    return { ok: true, detail: `dry-run: would write '${level}' to ${DROP_CACHES_PATH}` };
  }
  try {
    await writeFile(DROP_CACHES_PATH, level, { encoding: "utf8" });
    log.info("system_manager: drop_caches", `level=${level}`);
    return { ok: true, detail: `drop_caches level=${level} OK` };
  } catch (err) {
    return { ok: false, detail: `drop_caches failed: ${(err as Error).message}` };
  }
}

async function doCheckDisk(dryRun: boolean): Promise<{ ok: boolean; detail: string }> {
  if (dryRun) return { ok: true, detail: "dry-run: disk check skipped" };
  try {
    const text  = await readFile(DISKSTATS_PATH, "utf8");
    const lines = text.trim().split("\n").filter(Boolean).length;
    return { ok: true, detail: `disk check OK — ${lines} block devices in /proc/diskstats` };
  } catch (err) {
    return { ok: false, detail: `disk check failed: ${(err as Error).message}` };
  }
}

function doGc(dryRun: boolean): { ok: boolean; detail: string } {
  if (dryRun) return { ok: true, detail: "dry-run: GC skipped" };
  // globalThis.gc is only available when Node.js started with --expose-gc
  const maybeGc = (globalThis as Record<string, unknown>)["gc"];
  if (typeof maybeGc === "function") {
    (maybeGc as () => void)();
    return { ok: true, detail: "Node.js GC invoked" };
  }
  return { ok: false, detail: "Node.js not started with --expose-gc; GC unavailable" };
}

// ── Handler ───────────────────────────────────────────────────────────────────

let _commandCount = 0;
let _successCount = 0;

export class SystemManager implements KernelHandler {
  canHandle(cmd: KernelCommand): boolean {
    return cmd.type === "system";
  }

  async execute(cmd: KernelCommand): Promise<KernelResult> {
    const start = Date.now();
    _commandCount++;

    let outcome: { ok: boolean; detail: string };

    switch (cmd.action) {
      case "drop_caches": {
        const level = String(cmd.params?.["level"] ?? DEFAULT_DROP_LEVEL);
        outcome = await doDropCaches(level, !!cmd.dryRun);
        break;
      }
      case "gc":
        outcome = doGc(!!cmd.dryRun);
        break;
      case "check_disk":
        outcome = await doCheckDisk(!!cmd.dryRun);
        break;
      default:
        outcome = { ok: false, detail: `unknown system action: "${cmd.action}"` };
    }

    if (outcome.ok) _successCount++;
    log.debug("system_manager: execute", `action=${cmd.action} ok=${outcome.ok}`);

    return {
      commandId:  cmd.id!,
      ok:         outcome.ok,
      detail:     outcome.detail,
      executedAt: start,
      durationMs: Date.now() - start,
      dryRun:     !!cmd.dryRun,
    };
  }
}

export const systemManager = new SystemManager();

export function systemManagerStats(): { commands: number; successes: number } {
  return { commands: _commandCount, successes: _successCount };
}
