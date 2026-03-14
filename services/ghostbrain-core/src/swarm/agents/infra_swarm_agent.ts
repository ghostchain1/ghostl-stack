/**
 * GhostBrain Swarm — Infrastructure Swarm Agent  (domain: infrastructure)
 *
 * Handles infrastructure-level tasks: VM failures, host-level issues, disk
 * pressure.  All commands flow through the kernel command bus — no shell exec.
 */

import { dispatch } from "../../kernel/command_bus.js";
import { log }      from "../../observability/event_logger.js";
import type { SwarmAgent, SwarmTask, SwarmResult } from "../swarm_types.js";

export class InfraSwarmAgent implements SwarmAgent {
  readonly name   = "InfraSwarmAgent";
  readonly domain = "infrastructure" as const;

  private _handled = 0;
  private _ok      = 0;

  canHandle(task: SwarmTask): boolean {
    return (
      task.domain === "infrastructure" ||
      /vm_failure|node_restart|disk_full|host_unreachable/i.test(task.type)
    );
  }

  async execute(task: SwarmTask): Promise<SwarmResult> {
    this._handled++;
    const start      = Date.now();
    const resourceId = String(task.data.resourceId ?? "unknown");
    const isDisk     = /disk_full/i.test(task.type);

    // Disk pressure → drop kernel page cache (level 1 — safe, no data loss).
    // VM issues → kernel VM reboot command (controlled via LIBVIRT_REST_URL bridge).
    const cmd = isDisk
      ? {
          type:        "system"  as const,
          action:      "drop_caches",
          params:      { level: "1" },
          requestedBy: "InfraSwarmAgent",
          dryRun:      task.dryRun,
        }
      : {
          type:        "vm"      as const,
          action:      "reboot",
          target:      resourceId,
          requestedBy: "InfraSwarmAgent",
          dryRun:      task.dryRun,
        };

    const result = await dispatch(cmd);
    if (result.ok) this._ok++;
    log.info("infra_swarm_agent: execute", `resource=${resourceId} ok=${result.ok}`);

    return {
      taskId:     task.id,
      agentName:  this.name,
      domain:     this.domain,
      ok:         result.ok,
      detail:     result.detail ?? (result.ok ? "executed" : "failed"),
      executedAt: start,
      durationMs: Date.now() - start,
    };
  }

  stats(): Record<string, unknown> {
    return { handled: this._handled, ok: this._ok };
  }
}
