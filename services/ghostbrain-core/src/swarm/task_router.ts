/**
 * GhostBrain Autonomous Swarm — Task Router
 *
 * Maps incoming event types to SwarmTask objects with the correct
 * domain assignment.  The SwarmController then dispatches these to
 * the appropriate agents via the AgentRegistry.
 *
 * Routing table (event.type → domain):
 *   docker_failure, container_crash     → recovery
 *   vm_failure, node_restart            → infrastructure
 *   validator_issue, chain_desync       → blockchain
 *   security_alert, unauthorized_access → security
 *   deploy_request, upgrade_needed      → devops
 *   resource_pressure, high_cpu/mem     → performance
 */

import { randomUUID } from "node:crypto";
import { log }        from "../observability/event_logger.js";
import type { SwarmTask, SwarmEvent, SwarmDomain } from "./swarm_types.js";

// ── Routing table ─────────────────────────────────────────────────────────────

const ROUTES: Array<{ pattern: RegExp; domain: SwarmDomain }> = [
  { pattern: /docker_failure|container_crash|container_oom|container_exit/i, domain: "recovery"       },
  { pattern: /vm_failure|node_restart|disk_full|host_unreachable/i,           domain: "infrastructure" },
  { pattern: /validator_issue|chain_desync|missed_blocks|jailed_validator/i,  domain: "blockchain"     },
  { pattern: /security_alert|unauthorized|suspicious_rpc|access_denied/i,     domain: "security"       },
  { pattern: /deploy_request|upgrade_needed|contract_deploy|ci_trigger/i,     domain: "devops"         },
  { pattern: /resource_pressure|high_cpu|high_mem|throughput_drop/i,           domain: "performance"    },
];

function detectDomain(type: string): SwarmDomain {
  for (const r of ROUTES) {
    if (r.pattern.test(type)) return r.domain;
  }
  return "infrastructure";
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Build a SwarmTask from a fully-formed SwarmEvent.
 * The event's explicit domain is refined if the event type matches a routing rule.
 */
export function routeEvent(event: SwarmEvent): SwarmTask {
  const domain = detectDomain(event.type);
  const task: SwarmTask = {
    id:          randomUUID(),
    type:        event.type,
    domain,
    data:        { resourceId: event.resourceId, ...event.payload },
    requestedBy: "swarm_engine",
    ts:          Date.now(),
    dryRun:      false,
  };
  log.debug("task_router: routed_event", `type=${event.type} → domain=${domain} id=${task.id}`);
  return task;
}

/**
 * Build a SwarmTask from raw telemetry fields (used by the swarm engine
 * when processing monitor data without a pre-formed SwarmEvent).
 */
export function routeRaw(
  type:        string,
  resourceId:  string,
  payload:     Record<string, unknown> = {},
): SwarmTask {
  const domain = detectDomain(type);
  const task: SwarmTask = {
    id:          randomUUID(),
    type,
    domain,
    data:        { resourceId, ...payload },
    requestedBy: "swarm_engine",
    ts:          Date.now(),
    dryRun:      false,
  };
  log.debug("task_router: routed_raw", `type=${type} → domain=${domain} id=${task.id}`);
  return task;
}
