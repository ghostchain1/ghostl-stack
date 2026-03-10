/**
 * GhostBrain Agent Spawner — Registry + Lifecycle Management
 *
 * Start / stop / inspect all GhostBrain agents from a single location.
 *
 * Agents available:
 *   GhostOptimizer          — resource optimisation
 *   GhostRepairBot          — autonomous repair
 *   GhostLoadBalancer       — traffic/workload rebalancing
 *   GhostPredictor          — failure prediction
 *   GhostSecurityGuardian   — anomaly + security monitoring
 *
 * Usage:
 *   import { spawnAllAgents, stopAllAgents, getAgentStats } from "./index.js";
 *   await spawnAllAgents();
 */

import { GhostOptimizer,        type GhostOptimizerConfig }        from "./ghost_optimizer.js";
import { GhostRepairBot,        type GhostRepairBotConfig }        from "./ghost_repair_bot.js";
import { GhostLoadBalancer,     type GhostLoadBalancerConfig }     from "./ghost_load_balancer.js";
import { GhostPredictor,        type GhostPredictorConfig }        from "./ghost_predictor.js";
import { GhostSecurityGuardian, type GhostSecurityGuardianConfig } from "./ghost_security_guardian.js";
import { GhostDeployAI,         type GhostDeployAIConfig }         from "./ghost_deploy_ai.js";
import { log }                                                      from "../observability/event_logger.js";

// ── Types ─────────────────────────────────────────────────────────────────────

interface Agent {
  name:  string;
  stop:  () => void;
  stats: () => Record<string, unknown>;
}

export interface AgentSpawnConfig {
  optimizer?:         GhostOptimizerConfig;
  repairBot?:         GhostRepairBotConfig;
  loadBalancer?:      GhostLoadBalancerConfig;
  predictor?:         GhostPredictorConfig;
  securityGuardian?:  GhostSecurityGuardianConfig;
  deployAI?:          GhostDeployAIConfig;
  /** Disable individual agents by name */
  disabled?:          Array<"optimizer" | "repairBot" | "loadBalancer" | "predictor" | "securityGuardian" | "deployAI">;
}

// ── Registry ──────────────────────────────────────────────────────────────────

const registry = new Map<string, Agent>();

function register(agent: Agent): void {
  if (registry.has(agent.name)) {
    log.warn("agent: duplicate", `${agent.name} already registered — skipping`);
    return;
  }
  registry.set(agent.name, agent);
  log.info("agent: registered", agent.name);
}

// ── Spawn ─────────────────────────────────────────────────────────────────────

/**
 * Instantiate and start all enabled agents.
 */
export function spawnAllAgents(cfg: AgentSpawnConfig = {}): void {
  const disabled = new Set(cfg.disabled ?? []);

  if (!disabled.has("optimizer")) {
    register(new GhostOptimizer(cfg.optimizer));
  }
  if (!disabled.has("repairBot")) {
    register(new GhostRepairBot(cfg.repairBot));
  }
  if (!disabled.has("loadBalancer")) {
    register(new GhostLoadBalancer(cfg.loadBalancer));
  }
  if (!disabled.has("predictor")) {
    register(new GhostPredictor(cfg.predictor));
  }
  if (!disabled.has("securityGuardian")) {
    register(new GhostSecurityGuardian(cfg.securityGuardian));
  }
  if (!disabled.has("deployAI")) {
    register(new GhostDeployAI(cfg.deployAI));
  }

  log.info("agent-spawner: started", `${registry.size} agents active`);
}

/**
 * Stop all running agents and clear the registry.
 */
export function stopAllAgents(): void {
  for (const [name, agent] of registry) {
    try { agent.stop(); }
    catch (err) { log.warn("agent: stop_error", `${name}: ${String(err)}`); }
  }
  registry.clear();
  log.info("agent-spawner: stopped", "all agents stopped");
}

// ── Inspect ───────────────────────────────────────────────────────────────────

export function getAgentStats(): Record<string, Record<string, unknown>> {
  const out: Record<string, Record<string, unknown>> = {};
  for (const [name, agent] of registry) {
    out[name] = agent.stats();
  }
  return out;
}

export function getAgentNames(): string[] {
  return [...registry.keys()];
}

export function isAgentRunning(name: string): boolean {
  return registry.has(name);
}

// ── Re-exports ────────────────────────────────────────────────────────────────

export { GhostOptimizer }        from "./ghost_optimizer.js";
export { GhostRepairBot }        from "./ghost_repair_bot.js";
export { GhostLoadBalancer }     from "./ghost_load_balancer.js";
export { GhostPredictor }        from "./ghost_predictor.js";
export { GhostSecurityGuardian } from "./ghost_security_guardian.js";
export { GhostDeployAI }         from "./ghost_deploy_ai.js";
