/**
 * GhostStack Global AI Orchestrator — Task Router
 *
 * Defines the canonical Task type shared by every orchestrator component and
 * provides layer-aware routing that maps each task to the correct agent.
 *
 * Routing rules
 *   - All governance tasks route to GhostChain L1 for final settlement.
 *   - L2/L3 tasks are tagged with their origin chain; advisory output always
 *     targets L1 so settlement follows the L3→L2→L1 hierarchy.
 *   - SECURITY tasks are escalated to the governance agent for human review.
 *   - BRIDGE and GID tasks are handled by the infrastructure agent.
 *
 * Chain: GhostChain L1 (chain_id 14000101). Gas token: GST.
 */

// ── Chain constants ───────────────────────────────────────────────────────────

export const L1_CHAIN_ID = 14000101 as const;
export const L2_CHAIN_ID = 901       as const;
export const L3_CHAIN_ID = 903       as const;

// ── Task types ────────────────────────────────────────────────────────────────

export type TaskType =
  | "INFRASTRUCTURE"
  | "VALIDATOR"
  | "ECONOMIC"
  | "GOVERNANCE"
  | "SECURITY"
  | "BRIDGE"
  | "GID";

export type TaskPriority = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

export type TargetLayer = "L1" | "L2" | "L3" | "ALL";

export type AgentName =
  | "infrastructure_agent"
  | "validator_agent"
  | "economic_agent"
  | "governance_agent";

export interface Task {
  /** Unique task id — recommended format: `task-{type}-{timestamp}-{seq}` */
  id:          string;
  type:        TaskType;
  priority:    TaskPriority;
  targetLayer: TargetLayer;
  /** System or subsystem that generated this task, e.g. "ghostbrain-core". */
  origin:      string;
  payload:     Record<string, unknown>;
  createdAt:   number;  // Unix seconds
  chain_id:    number;  // canonical = L1_CHAIN_ID (14000101)
  gas_token:   string;  // always "GST"
}

export interface AgentResult {
  taskId:    string;
  agentName: AgentName;
  success:   boolean;
  output:    Record<string, unknown>;
  handledAt: number;  // Unix seconds
  chain_id:  number;
  gas_token: string;
}

export interface AgentHealth {
  name:         AgentName;
  healthy:      boolean;
  lastTaskAt:   number | null;  // Unix seconds
  errorCount:   number;
  successCount: number;
}

/** Contract every agent must satisfy. */
export interface Agent {
  readonly name: AgentName;
  handle(task: Task): Promise<AgentResult>;
  health(): AgentHealth;
}

export interface RoutingDecision {
  agentName: AgentName;
  priority:  TaskPriority;
  /** Resolved chain id from the task's targetLayer. */
  chainId:   number;
  notes:     string;
}

// ── TaskRouter ────────────────────────────────────────────────────────────────

/**
 * Maps tasks to the correct agent and resolves the target chain ID,
 * enforcing the L3 → L2 → L1 settlement hierarchy.
 */
export class TaskRouter {
  private seq = 0;

  /** Generate a time-ordered task id. */
  nextId(type: TaskType): string {
    return `task-${type}-${Date.now()}-${++this.seq}`;
  }

  /**
   * Route a task to an agent.
   * Returns `undefined` for unknown task types — caller should drop/log.
   */
  route(task: Task): RoutingDecision | undefined {
    const agentName = this._agentFor(task.type);
    if (agentName === undefined) return undefined;

    const chainId = this._chainIdFor(task.targetLayer);
    return {
      agentName,
      priority: task.priority,
      chainId,
      notes:    this._notes(task, agentName, chainId),
    };
  }

  // ── Private helpers ────────────────────────────────────────────────────────

  private _agentFor(type: TaskType): AgentName | undefined {
    switch (type) {
      case "INFRASTRUCTURE": return "infrastructure_agent";
      case "VALIDATOR":      return "validator_agent";
      case "ECONOMIC":       return "economic_agent";
      case "GOVERNANCE":     return "governance_agent";
      // SECURITY escalates to governance for mandatory human review.
      case "SECURITY":       return "governance_agent";
      // BRIDGE and GID route to infra agent (node/identity plumbing).
      case "BRIDGE":         return "infrastructure_agent";
      case "GID":            return "infrastructure_agent";
      default: {
        const _exhaustive: never = type;
        console.warn("[TaskRouter] Unknown task type:", _exhaustive);
        return undefined;
      }
    }
  }

  /**
   * L2/L3 tasks are advisory-only for their origin layer;
   * all on-chain settlement ultimately routes through L1.
   */
  private _chainIdFor(layer: TargetLayer): number {
    switch (layer) {
      case "L1":
      case "ALL":  return L1_CHAIN_ID;
      case "L2":   return L2_CHAIN_ID;
      case "L3":   return L3_CHAIN_ID;
      default: {
        const _exhaustive: never = layer;
        console.warn("[TaskRouter] Unknown layer:", _exhaustive);
        return L1_CHAIN_ID;
      }
    }
  }

  private _notes(task: Task, agent: AgentName, chainId: number): string {
    const parts = [
      `type=${task.type}`,
      `→ agent=${agent}`,
      `chain=${chainId}`,
      `priority=${task.priority}`,
    ];
    if (task.type === "SECURITY") parts.push("escalated_to_governance_for_human_review");
    return parts.join(" ");
  }
}
