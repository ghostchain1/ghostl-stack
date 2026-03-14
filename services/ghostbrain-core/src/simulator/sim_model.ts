/**
 * GhostBrain Infrastructure Simulator — State Model & Shared Types
 *
 * Every proposed infrastructure action flows through a 4-step pipeline:
 *
 *   SimAction  →  action_simulator  →  SimOutcome
 *                         ↓
 *                  safety_evaluator  →  verdict (approve / block / require_ratification)
 *
 * The entire pipeline is synchronous / pure — no side effects.
 * Actual execution is performed by the caller (infra_supervisor.ts) only if
 * the verdict is "approve".
 */

// ── Action types ──────────────────────────────────────────────────────────────

export type SimActionType =
  | "restart_container"
  | "throttle_container_cpu"   // restrict CPU allocation
  | "throttle_container_mem"   // restrict memory limit
  | "unthrottle_container"     // restore normal resource limits
  | "evict_container"          // stop container (not restarted automatically)
  | "adjust_vm_memory"         // change VM RAM allocation
  | "migrate_workload"         // move container/VM to another cluster node
  | "flush_cache"              // free in-process memory cache (e.g. Redis flush)
  | "noop";

export type SimActionRequester = "supervisor" | "scheduler" | "operator" | "ai";
export type SimUrgency         = "low" | "medium" | "high" | "critical";

export interface SimAction {
  type:        SimActionType;
  /** Container name, VM domain name, or "host" for host-level actions. */
  targetId:    string;
  params?: {
    /** For throttle_container_cpu: new CPU % limit (1–100). */
    cpuLimitPercent?: number;
    /** For throttle_container_mem / adjust_vm_memory: new limit in MB. */
    memLimitMb?:      number;
    /** For migrate_workload: destination node ID. */
    targetNodeId?:    string;
  };
  requestedBy: SimActionRequester;
  urgency:     SimUrgency;
}

// ── System state snapshot ─────────────────────────────────────────────────────

export interface SimContainerState {
  cpuPct:      number;   // current usage 0–100
  memPct:      number;   // current usage 0–100
  memUsageMb:  number;   // current usage in MB
  memLimitMb:  number;   // current limit in MB (0 = unlimited)
  cpuLimitPct: number;   // current CPU limit (0 = unlimited)
  alive:        boolean;
  /** True if this container is a canonical GhostChain layer node. */
  isChainNode:  boolean;
  /** Which chain layer this container backs (undefined if not a chain node). */
  chainLayer?:  "l1" | "l2" | "l3";
}

export interface SimChainState {
  alive:       boolean;
  blockHeight: number;
}

export interface SimState {
  timestamp:  number;
  host: {
    cpuPct:       number;
    memPct:       number;
    memTotalMb:   number;
    diskIoSatPct: number;
  };
  containers: Record<string, SimContainerState>;
  chains: {
    l1: SimChainState;
    l2: SimChainState;
    l3: SimChainState;
  };
}

// ── Simulation result ─────────────────────────────────────────────────────────

export type SimRiskCategory =
  | "chain_downtime"
  | "memory_oom"
  | "cpu_overload"
  | "cascade_failure"
  | "data_loss";

export type SimRiskSeverity = "low" | "medium" | "high" | "critical";

export interface SimRisk {
  category:    SimRiskCategory;
  probability: number;         // 0–1
  severity:    SimRiskSeverity;
  description: string;
}

export type SimVerdict =
  | "approve"               // safe — execute immediately
  | "block"                 // too dangerous — do not execute
  | "require_ratification"; // requires human ratification (governance quorum)

export interface SimOutcome {
  action:        SimAction;
  preState:      SimState;
  postState:     SimState;       // predicted state post-action
  deltaMs:       number;         // estimated action duration in ms
  confidence:    number;         // 0–100: model confidence in post-state accuracy
  risks:         SimRisk[];
  verdict:       SimVerdict;
  verdictReason: string;
  simulatedAt:   number;
}
