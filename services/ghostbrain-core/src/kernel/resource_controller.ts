/**
 * GhostBrain Kernel — Resource Controller
 *
 * Analyses the most recent infrastructure metrics from InfraMemory and
 * derives a prioritised list of KernelCommands for the KernelEngine to
 * dispatch through the CommandBus.
 *
 * Generation rules (evaluated per resource snapshot, most urgent first):
 *
 *   container CPU/Mem ≥ CRISIS threshold  → docker restart
 *   container Mem ≥ HIGH threshold        → system drop_caches (level=1)
 *
 * VM actions are intentionally excluded from autonomous generation — they
 * always require human ratification via the signing relay.
 *
 * MAX_CMD_PER_TICK limits recommendations so the kernel cannot take more
 * than a bounded set of actions in any single 5-second window.
 *
 * Env vars:
 *   KERNEL_CPU_CRISIS=92    CPU % threshold for container restart
 *   KERNEL_MEM_CRISIS=92    Mem % threshold for container restart
 *   KERNEL_MEM_HIGH=85      Mem % threshold for drop_caches
 *   KERNEL_MAX_CMD=3        Max commands generated per analysis tick
 */

import { getInfraHistory }  from "../memory/infrastructure_memory.js";
import type { KernelCommand } from "./kernel_types.js";
import { log } from "../observability/event_logger.js";

// ── Config ────────────────────────────────────────────────────────────────────

const CPU_CRISIS_PCT   = Number(process.env.KERNEL_CPU_CRISIS ?? "92");
const MEM_CRISIS_PCT   = Number(process.env.KERNEL_MEM_CRISIS ?? "92");
const MEM_HIGH_PCT     = Number(process.env.KERNEL_MEM_HIGH   ?? "85");
const MAX_CMD_PER_TICK = Number(process.env.KERNEL_MAX_CMD    ?? "3");

// ── Types ─────────────────────────────────────────────────────────────────────

export interface ResourceSummary {
  resourceId: string;
  layer:      string;
  cpuPct:     number;
  memPct:     number;
  ts:         number;
}

// ── Analysis ──────────────────────────────────────────────────────────────────

/**
 * Collapse recent InfraMemory snapshots to one summary entry per
 * resourceId (most recent sample wins).
 */
export function analyzeResources(): ResourceSummary[] {
  const history = getInfraHistory(undefined, undefined, 30_000); // last 30 s
  const latest  = new Map<string, ResourceSummary>();

  for (const snap of history) {
    const ex = latest.get(snap.resourceId);
    if (!ex || snap.ts > ex.ts) {
      latest.set(snap.resourceId, {
        resourceId: snap.resourceId,
        layer:      snap.layer,
        cpuPct:     snap.cpuPct,
        memPct:     snap.memPct,
        ts:         snap.ts,
      });
    }
  }

  return [...latest.values()];
}

/**
 * Derive KernelCommands from the current infrastructure state.
 * Respects MAX_CMD_PER_TICK hard cap.
 */
export function rebalance(): KernelCommand[] {
  const resources = analyzeResources();
  const commands: KernelCommand[] = [];

  for (const r of resources) {
    if (commands.length >= MAX_CMD_PER_TICK) break;

    if (r.layer === "container") {
      if (r.cpuPct >= CPU_CRISIS_PCT || r.memPct >= MEM_CRISIS_PCT) {
        // Crisis-level: restart the container to shed load
        const reason = r.cpuPct >= CPU_CRISIS_PCT ? "cpu_crisis" : "mem_crisis";
        commands.push({
          type:        "docker",
          action:      "restart",
          target:      r.resourceId,
          requestedBy: "resource_controller",
          params:      {
            reason,
            cpuPct: r.cpuPct,
            memPct: r.memPct,
          },
        });
        log.info(
          "resource_controller: restart_command",
          `${r.resourceId} reason=${reason} cpu=${r.cpuPct.toFixed(1)}% mem=${r.memPct.toFixed(1)}%`,
        );
      } else if (r.memPct >= MEM_HIGH_PCT) {
        // High memory: drop page cache (level=1) — non-disruptive
        commands.push({
          type:        "system",
          action:      "drop_caches",
          requestedBy: "resource_controller",
          params:      { level: "1", reason: "container_mem_high", resourceId: r.resourceId },
        });
        log.info(
          "resource_controller: drop_caches_command",
          `container=${r.resourceId} mem=${r.memPct.toFixed(1)}%`,
        );
      }
    }
  }

  return commands;
}

export function resourceControllerStats(): {
  resources:  number;
  thresholds: Record<string, number>;
} {
  return {
    resources: analyzeResources().length,
    thresholds: {
      CPU_CRISIS_PCT,
      MEM_CRISIS_PCT,
      MEM_HIGH_PCT,
      MAX_CMD_PER_TICK,
    },
  };
}
