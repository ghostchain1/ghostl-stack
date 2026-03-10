/**
 * GhostBrain Autonomous Swarm — Swarm Controller
 *
 * Centralized dispatch hub.  Accepts SwarmTasks, finds a capable agent via
 * the AgentRegistry, executes it, and syncs results to GhostBrain memory.
 *
 * Metrics emitted:
 *   ghostbrain_swarm_tasks_total     — tasks dispatched
 *   ghostbrain_swarm_repairs_total   — tasks completed successfully
 *   ghostbrain_swarm_failures_total  — tasks that failed
 *   ghostbrain_swarm_no_agent_total  — tasks for which no agent was found
 */

import { findAgent }       from "./agent_registry.js";
import { broadcastResult } from "./swarm_memory_sync.js";
import { log }             from "../observability/event_logger.js";
import { inc }             from "../observability/metrics_exporter.js";
import type { SwarmTask, SwarmResult } from "./swarm_types.js";
import { forwardToSwarm }  from "./ghost_swarm_bridge.js";

// ── State ─────────────────────────────────────────────────────────────────────

let _dispatched = 0;
let _ok         = 0;
let _failed     = 0;
let _noAgent    = 0;

// Ring buffer — last 100 results
const _results: SwarmResult[] = [];
const RING_MAX = 100;

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Dispatch a SwarmTask to the first capable agent.
 * Returns the SwarmResult or null when no agent can handle the task.
 */
export async function dispatchTask(task: SwarmTask): Promise<SwarmResult | null> {
  _dispatched++;
  inc("ghostbrain_swarm_tasks_total", "Total swarm tasks dispatched");

  const agent = findAgent(task);
  if (!agent) {
    _noAgent++;
    inc("ghostbrain_swarm_no_agent_total", "Swarm tasks with no capable agent");
    log.warn("swarm_controller: no_agent", `type=${task.type} domain=${task.domain}`);
    // Attempt to forward to the ghost-ai-swarm service (external swarm at port 4080)
    const bridged = await forwardToSwarm(task.domain, task.type, task.data ?? {}, task.dryRun);
    if (bridged) {
      log.info("swarm_controller: bridged_to_ghost_swarm", `agent=${bridged.agent} ok=${bridged.ok} dryRun=${bridged.dryRun}`);
      const bridgeResult: SwarmResult = {
        taskId:     task.id,
        agentName:  `ghost-ai-swarm:${bridged.agent}`,
        domain:     task.domain,
        ok:         bridged.ok,
        detail:     bridged.detail,
        executedAt: Date.now(),
        durationMs: 0,
      };
      _results.push(bridgeResult);
      if (_results.length > RING_MAX) _results.shift();
      return bridgeResult;
    }
    return null;
  }

  const start = Date.now();
  try {
    const result = await agent.execute(task);
    result.durationMs = Date.now() - start;

    if (result.ok) {
      _ok++;
      inc("ghostbrain_swarm_repairs_total", "Swarm successful task completions");
    } else {
      _failed++;
      inc("ghostbrain_swarm_failures_total", "Swarm failed task completions");
    }

    broadcastResult(result);
    _results.push(result);
    if (_results.length > RING_MAX) _results.shift();

    log.info(
      "swarm_controller: dispatched",
      `agent=${agent.name} type=${task.type} ok=${result.ok} ms=${result.durationMs}`,
    );
    return result;
  } catch (err) {
    _failed++;
    inc("ghostbrain_swarm_failures_total", "Swarm failed task completions");
    log.error("swarm_controller: dispatch_error", `agent=${agent.name} err=${String(err)}`);
    return {
      taskId:     task.id,
      agentName:  agent.name,
      domain:     task.domain,
      ok:         false,
      detail:     String(err),
      executedAt: start,
      durationMs: Date.now() - start,
    };
  }
}

export function getRecentResults(n = 20): SwarmResult[] {
  return _results.slice(-Math.min(n, RING_MAX));
}

export function swarmControllerStats() {
  return {
    dispatched: _dispatched,
    ok:         _ok,
    failed:     _failed,
    noAgent:    _noAgent,
  };
}
