/**
 * GhostBrain Swarm AI — Shared Agent Interface
 *
 * Defines the contract every swarm agent must implement.
 * Placed in coordination/ so it can be imported by both agents and the
 * controller without creating circular dependency cycles.
 */

import type { GhostMemoryEngine } from "../../memory/engine/memory_engine.js";
import type { AgentBus }          from "../messaging/agent_bus.js";

// ---------------------------------------------------------------------------
// Agent interface
// ---------------------------------------------------------------------------

export type SwarmRole =
  | "architect"
  | "infrastructure"
  | "security"
  | "compiler"
  | "network"
  | "treasury";

/** Dependencies injected into every agent on each tick. */
export interface SwarmContext {
  /** Persistent memory — agents read from this, never write directly. */
  memory: GhostMemoryEngine;
  /** In-process pub/sub bus for inter-agent messages. */
  bus: AgentBus;
  /** Current swarm tick counter, monotonically increasing. */
  tick: number;
}

/** Recommendation produced by an agent in a single act() call. */
export interface AgentRecommendation {
  /** Unique action kind — drives deduplication in ConsensusEngine. */
  kind:        string;
  /** Optional target (container name, VM name, iface, etc.). */
  target?:     string;
  /** How strongly the agent endorses this action. 0.0–1.0. */
  confidence:  number;
  /** Higher = more urgent. Ranges are agent-defined; ConsensusEngine sorts. */
  priority:    number;
  /** Human-readable rationale. */
  description: string;
}

/** Report returned by each agent after one act() call. */
export interface AgentReport {
  agentName:       string;
  role:            SwarmRole;
  healthy:         boolean;
  durationMs:      number;
  recommendations: AgentRecommendation[];
  /** Optional diagnostic summary for /status endpoint. */
  summary?:        string;
}

/** Every swarm agent must implement this interface. */
export interface ISwarmAgent {
  readonly name: string;
  readonly role: SwarmRole;
  /** Called once per swarm tick. Must not throw — return { healthy:false } on error. */
  act(ctx: SwarmContext): Promise<AgentReport>;
  /** Optional graceful cleanup on swarm shutdown. */
  shutdown?(): Promise<void>;
}
