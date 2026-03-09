import { z } from "zod";

// ─── Agent type definitions ───────────────────────────────────────────────────

export type AgentId = string;

export type AgentRole =
  // Legacy direct agents
  | "core"
  | "protocol"
  | "defi"
  | "governor"
  | "contract"
  | "infra"
  // Swarm v2 agents
  | "architect"
  | "executor"
  | "auditor"
  | "network"
  | "node"
  | "treasury"
  | "market"
  | "dex"
  | "lend"
  | "security"
  | "fraud"
  | "dao";

export type AgentStatus = "online" | "offline" | "degraded";

export interface AgentDescriptor {
  id:       AgentId;
  role:     AgentRole;
  url:      string;
  status:   AgentStatus;
  lastSeen: number;   // Unix ms
  latency:  number;   // Last probe latency in ms
  taskCount: number;  // Total tasks dispatched to this agent
}

// ─── Task definitions ─────────────────────────────────────────────────────────

export type TaskType =
  // Legacy tasks
  | "classify-transaction"
  | "score-risk"
  | "draft-proposal"
  | "detect-anomaly"
  | "optimize-liquidity"
  | "audit-contract"
  | "monitor-infra"
  | "consensus-vote"
  // Swarm v2 tasks
  | "analyze-ecosystem"
  | "design-upgrade"
  | "generate-code"
  | "deploy-contract"
  | "propose-upgrade"
  | "analyze-vote"
  | "cast-vote"
  | "enforce-constitution"
  | "provision-vm"
  | "scale-service"
  | "repair-node"
  | "manage-bridge"
  | "sync-layers"
  | "restart-node"
  | "update-client"
  | "generate-contract"
  | "allocate-liquidity"
  | "optimize-yield"
  | "detect-arbitrage"
  | "forecast-economics"
  | "rebalance-pool"
  | "adjust-swap-fee"
  | "adjust-rate"
  | "check-liquidation"
  | "monitor-attacks"
  | "block-contract"
  | "aml-scan"
  | "fraud-pattern";

export type TaskPriority = "low" | "normal" | "high" | "critical";

export interface SwarmTask {
  id:         string;
  type:       TaskType;
  priority:   TaskPriority;
  payload:    Record<string, unknown>;
  targetRole?: AgentRole;   // Pin to specific agent role (optional)
  quorum:     number;       // How many agents must agree (1 = single-agent)
  createdAt:  number;
  deadline:   number;
}

export interface TaskResult {
  taskId:    string;
  agentId:   AgentId;
  agentRole: AgentRole;
  output:    Record<string, unknown>;
  durationMs: number;
  success:   boolean;
  error?:    string;
}

export interface QuorumResult {
  taskId:   string;
  results:  TaskResult[];
  reached:  boolean;   // Whether quorum was reached
  consensus?: Record<string, unknown>;  // Merged/voted output
}

// ─── Zod schemas for route validation ────────────────────────────────────────

export const SubmitTaskSchema = z.object({
  type:        z.enum([
    "classify-transaction",
    "score-risk",
    "draft-proposal",
    "detect-anomaly",
    "optimize-liquidity",
    "audit-contract",
    "monitor-infra",
    "consensus-vote",
    "analyze-ecosystem",
    "design-upgrade",
    "generate-code",
    "deploy-contract",
    "propose-upgrade",
    "analyze-vote",
    "cast-vote",
    "enforce-constitution",
    "provision-vm",
    "scale-service",
    "repair-node",
    "manage-bridge",
    "sync-layers",
    "restart-node",
    "update-client",
    "generate-contract",
    "allocate-liquidity",
    "optimize-yield",
    "detect-arbitrage",
    "forecast-economics",
    "rebalance-pool",
    "adjust-swap-fee",
    "adjust-rate",
    "check-liquidation",
    "monitor-attacks",
    "block-contract",
    "aml-scan",
    "fraud-pattern",
  ]),
  priority:    z.enum(["low", "normal", "high", "critical"]).default("normal"),
  payload:     z.record(z.unknown()),
  targetRole:  z.enum([
    "core","protocol","defi","governor","contract","infra",
    "architect","executor","auditor","network","node",
    "treasury","market","dex","lend","security","fraud","dao",
  ]).optional(),
  quorum:      z.number().int().min(1).max(18).default(1),
  deadlineMs:  z.number().int().min(1000).max(300_000).default(30_000),
});

export type SubmitTaskInput = z.infer<typeof SubmitTaskSchema>;
