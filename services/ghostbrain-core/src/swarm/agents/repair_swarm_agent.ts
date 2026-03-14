/**
 * GhostBrain Swarm — Repair Swarm Agent  (domain: recovery)
 *
 * Handles recovery tasks: container crashes, OOM kills, restart storms.
 * Delegates to the auto_repair_engine which enforces PolicyGuard + the
 * per-resource circuit breaker (max REPAIR_MAX_PER_HOUR/h).
 */

import { executeRepair } from "../../auto_repair_engine.js";
import { log }           from "../../observability/event_logger.js";
import type { SwarmAgent, SwarmTask, SwarmResult } from "../swarm_types.js";

export class RepairSwarmAgent implements SwarmAgent {
  readonly name   = "RepairSwarmAgent";
  readonly domain = "recovery" as const;

  private _handled = 0;
  private _ok      = 0;

  canHandle(task: SwarmTask): boolean {
    return (
      task.domain === "recovery" ||
      /docker_failure|container_crash|container_oom|container_exit/i.test(task.type)
    );
  }

  async execute(task: SwarmTask): Promise<SwarmResult> {
    this._handled++;
    const start      = Date.now();
    const resourceId = String(task.data.resourceId ?? task.data.containerId ?? "unknown");
    const restarts   = Number(task.data.restarts ?? 0);

    const repair = await executeRepair({
      resourceId,
      layer:       "container",
      strategy:    restarts > 3 ? "redeploy_service" : "restart_container",
      params:      { containerId: resourceId },
      triggerEvent: task.type,
      rationale:   `Swarm RepairAgent: ${task.type} on ${resourceId}`,
      confidence:  restarts > 5 ? 0.85 : 0.6,
      dryRun:      task.dryRun,
    });

    if (repair.success) this._ok++;
    log.info("repair_swarm_agent: execute", `resource=${resourceId} ok=${repair.success}`);

    return {
      taskId:     task.id,
      agentName:  this.name,
      domain:     this.domain,
      ok:         repair.success,
      detail:     repair.detail ?? (repair.success ? "repair executed" : "repair failed"),
      executedAt: start,
      durationMs: Date.now() - start,
    };
  }

  stats(): Record<string, unknown> {
    return { handled: this._handled, ok: this._ok };
  }
}
