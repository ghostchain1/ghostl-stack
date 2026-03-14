/**
 * GhostBrain Autonomous Swarm — Agent Registry
 *
 * Maintains the live registry of all SwarmAgent implementations.
 * Agents self-register at swarm startup; the SwarmController queries this
 * registry to find a capable agent for each SwarmTask.
 */

import { log } from "../observability/event_logger.js";
import type { SwarmAgent, SwarmTask, SwarmDomain } from "./swarm_types.js";

// ── Internal registry ─────────────────────────────────────────────────────────

const _registry = new Map<string, SwarmAgent>();

// ── Public API ────────────────────────────────────────────────────────────────

export function registerAgent(agent: SwarmAgent): void {
  if (_registry.has(agent.name)) {
    log.warn("swarm_registry: duplicate", `${agent.name} already registered — skipping`);
    return;
  }
  _registry.set(agent.name, agent);
  log.info("swarm_registry: registered", `${agent.name} domain=${agent.domain}`);
}

/** Direct lookup by name. */
export function getAgent(name: string): SwarmAgent | undefined {
  return _registry.get(name);
}

/**
 * Returns the first registered agent that claims it can handle the task.
 * Agents are iterated in registration order.
 */
export function findAgent(task: SwarmTask): SwarmAgent | undefined {
  for (const agent of _registry.values()) {
    if (agent.canHandle(task)) return agent;
  }
  return undefined;
}

/** Returns every agent registered under a given domain. */
export function getAgentsByDomain(domain: SwarmDomain): SwarmAgent[] {
  return [..._registry.values()].filter(a => a.domain === domain);
}

export function listAgents(): Array<{ name: string; domain: SwarmDomain }> {
  return [..._registry.values()].map(a => ({ name: a.name, domain: a.domain }));
}

export function agentCount(): number {
  return _registry.size;
}

/** Clears all registrations — used in tests. */
export function clearRegistry(): void {
  _registry.clear();
}
