/**
 * GhostBrain HyperCore — Swarm Controller
 *
 * Strategic-level dispatch layer that routes HyperCore directives to the
 * appropriate GhostBrain AI agents.  Operates above the per-plan
 * AgentCoordinator (cognitive layer) to coordinate system-level missions.
 *
 * Managed agents (via agent registry):
 *   GhostOptimizer          — resource optimisation
 *   GhostRepairBot          — autonomous repair
 *   GhostLoadBalancer       — traffic / workload rebalancing
 *   GhostPredictor          — failure prediction
 *   GhostSecurityGuardian   — anomaly + security monitoring
 *
 * A directive ring ensures dispatch history is retained and auditable.
 * Directives flagged `autonomous=false` are held as `governance_pending`
 * and surfaced via the /hypercore/swarm route for human action.
 *
 * Prometheus metrics:
 *   ghostbrain_hypercore_swarm_dispatched_total
 *   ghostbrain_hypercore_swarm_governance_pending_total
 *   ghostbrain_hypercore_swarm_failed_total
 */

import { randomUUID }                                  from "node:crypto";
import { getAgentNames, isAgentRunning, getAgentStats } from "../agents/index.js";
import { enqueue, Priority }                            from "../orchestrator/resource_scheduler.js";
import { inc }                                          from "../observability/metrics_exporter.js";
import { log }                                          from "../observability/event_logger.js";
import type { JobType, JobPriority }                from "../orchestrator/resource_scheduler.js";

// ── Types ─────────────────────────────────────────────────────────────────────

export type DirectiveStatus   = "pending" | "dispatched" | "governance_pending" | "failed";
export type DirectivePriority = "low" | "normal" | "high" | "critical";

export interface SwarmDirective {
  id:            string;
  ts:            number;
  source:        "hypercore" | "cognitive" | "manual";
  /** Named agent or "broadcast" */
  agentTarget:   string;
  task:          string;
  jobType:       JobType;
  resourceId:    string;
  params:        Record<string, unknown>;
  priority:      DirectivePriority;
  autonomous:    boolean;
  status:        DirectiveStatus;
  dispatchedAt?: number;
}

export interface SwarmDispatchOpts {
  priority?:   DirectivePriority;
  agentTarget?: string;
  autonomous?:  boolean;
  source?:      "hypercore" | "cognitive" | "manual";
}

// ── State ─────────────────────────────────────────────────────────────────────

const _ring: SwarmDirective[] = [];
const MAX_RING                = 1000;
let   _dispatchCount          = 0;

function pushDirective(d: SwarmDirective): void {
  _ring.push(d);
  if (_ring.length > MAX_RING) _ring.shift();
}

function priorityToJobPrio(p: DirectivePriority): JobPriority {
  if (p === "critical") return Priority.EMERGENCY as JobPriority;
  if (p === "high")     return Priority.HIGH      as JobPriority;
  if (p === "normal")   return Priority.MEDIUM    as JobPriority;
  return Priority.LOW as JobPriority;
}

// ── Engine ────────────────────────────────────────────────────────────────────

export class SwarmController {

  /**
   * Dispatch a strategic task directive.
   * Returns the created directive for tracking and auditability.
   */
  dispatch(
    task:       string,
    jobType:    JobType,
    resourceId: string,
    params:     Record<string, unknown> = {},
    opts:       SwarmDispatchOpts       = {},
  ): SwarmDirective {
    const priority   = opts.priority    ?? "normal";
    const autonomous = opts.autonomous  ?? true;
    const source     = opts.source      ?? "hypercore";
    const agentTarget = opts.agentTarget ?? "any";

    const directive: SwarmDirective = {
      id:          randomUUID(),
      ts:          Date.now(),
      source,
      agentTarget,
      task,
      jobType,
      resourceId,
      params,
      priority,
      autonomous,
      status: "pending",
    };

    if (!autonomous) {
      directive.status = "governance_pending";
      inc("ghostbrain_hypercore_swarm_governance_pending_total", "Directives awaiting governance ratification");
      log.warn("hypercore.swarm_controller", `governance_pending: task=${task} resource=${resourceId}`);
      pushDirective(directive);
      return directive;
    }

    try {
      enqueue(
        jobType,
        resourceId,
        priorityToJobPrio(priority),
        { task, agentTarget, ...params },
      );
      directive.status       = "dispatched";
      directive.dispatchedAt = Date.now();
      _dispatchCount++;
      inc("ghostbrain_hypercore_swarm_dispatched_total", "Total swarm directives dispatched");
      log.info("hypercore.swarm_controller", `dispatched: task=${task} resource=${resourceId} priority=${priority}`);
    } catch (err) {
      directive.status = "failed";
      inc("ghostbrain_hypercore_swarm_failed_total", "Failed swarm directive dispatches");
      log.error("hypercore.swarm_controller", `dispatch_failed: ${String(err)}`);
    }

    pushDirective(directive);
    return directive;
  }

  /**
   * Broadcast an alert through the scheduler to all active agents.
   */
  broadcastAlert(
    message:    string,
    severity:   "info" | "warning" | "critical",
    resourceId: string = "system",
  ): void {
    const priority: DirectivePriority =
      severity === "critical" ? "critical"
        : severity === "warning"  ? "high"
          : "normal";

    this.dispatch(
      `alert:${message.slice(0, 80)}`,
      "alert",
      resourceId,
      { message, severity },
      { priority, agentTarget: "broadcast", autonomous: true, source: "hypercore" },
    );
  }

  /** Current agent roster from the agent registry. */
  agentRoster(): { name: string; running: boolean; stats: Record<string, unknown> }[] {
    const allStats = getAgentStats();
    return getAgentNames().map(name => ({
      name,
      running: isAgentRunning(name),
      stats:   allStats[name] ?? {},
    }));
  }

  getDirectives(n = 50): SwarmDirective[] {
    return _ring.slice(-n);
  }

  stats() {
    return {
      dispatched:        _dispatchCount,
      totalDirectives:   _ring.length,
      governancePending: _ring.filter(d => d.status === "governance_pending").length,
      failed:            _ring.filter(d => d.status === "failed").length,
      agentCount:        getAgentNames().length,
      agentsRunning:     getAgentNames().filter(n => isAgentRunning(n)).length,
    };
  }
}

export const swarmController = new SwarmController();
