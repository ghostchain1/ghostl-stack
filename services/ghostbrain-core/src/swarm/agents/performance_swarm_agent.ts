/**
 * GhostBrain Swarm — Performance Swarm Agent  (domain: performance)
 *
 * Handles performance tasks: CPU/memory pressure, throughput degradation.
 * Routes commands through the kernel bus — typed, structured, no shell exec.
 *
 *   high_mem / memory_pressure → kernel system:drop_caches (level 1)
 *   high_cpu / throughput_drop → kernel resource:rebalance
 */

import { dispatch }    from "../../kernel/command_bus.js";
import { store_event } from "../../memory_engine.js";
import { log }         from "../../observability/event_logger.js";
import type { SwarmAgent, SwarmTask, SwarmResult } from "../swarm_types.js";

const MEMORY_RE = /high_mem|memory_pressure/i;

export class PerformanceSwarmAgent implements SwarmAgent {
  readonly name   = "PerformanceSwarmAgent";
  readonly domain = "performance" as const;

  private _handled   = 0;
  private _optimized = 0;

  canHandle(task: SwarmTask): boolean {
    return (
      task.domain === "performance" ||
      /resource_pressure|high_cpu|high_mem|throughput_drop/i.test(task.type)
    );
  }

  async execute(task: SwarmTask): Promise<SwarmResult> {
    this._handled++;
    const start      = Date.now();
    const resourceId = String(task.data.resourceId ?? "system");
    const isMemory   = MEMORY_RE.test(task.type);

    store_event({
      category:   "performance",
      label:      "swarm_performance_action",
      resourceId,
      layer:      "performance",
      severity:   "warning",
      payload:    task.data,
    });

    const cmd = isMemory
      ? {
          type:        "system"   as const,
          action:      "drop_caches",
          params:      { level: "1" },
          requestedBy: "PerformanceSwarmAgent",
          dryRun:      task.dryRun,
        }
      : {
          type:        "resource" as const,
          action:      "rebalance",
          target:      resourceId,
          requestedBy: "PerformanceSwarmAgent",
          dryRun:      task.dryRun,
        };

    const result = await dispatch(cmd);
    if (result.ok) this._optimized++;
    log.info("performance_swarm_agent: execute", `type=${task.type} resource=${resourceId} ok=${result.ok}`);

    return {
      taskId:     task.id,
      agentName:  this.name,
      domain:     this.domain,
      ok:         result.ok,
      detail:     result.detail ?? (result.ok ? "optimisation applied" : "optimisation failed"),
      executedAt: start,
      durationMs: Date.now() - start,
    };
  }

  stats(): Record<string, unknown> {
    return { handled: this._handled, optimized: this._optimized };
  }
}
