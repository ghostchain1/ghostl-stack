/**
 * ghost-ai-swarm-v2 — Agent types & task definitions
 *
 * All 15 AI agents in the GhostStack control plane share these types.
 */

import { z } from "zod";

// ─── Agent roles ─────────────────────────────────────────────────────────────

export type AgentRole =
  // Core AI
  | "architect"     // GhostArchitect — design upgrades, analyze ecosystem
  | "executor"      // GhostExecutor  — write + deploy code
  | "auditor"       // GhostAuditor   — security auditing
  | "governor"      // GhostGovernor  — governance, DAO proposals
  // Infrastructure AI
  | "infra"         // GhostInfra     — VMs, containers, self-healing
  | "network"       // GhostNetwork   — bridges, L1/L2/L3 sync
  | "node"          // GhostNode      — blockchain node management
  | "contract"      // GhostContract  — smart contract generation
  // Economic AI
  | "treasury"      // GhostTreasury  — liquidity, yield, allocation
  | "market"        // GhostMarket    — arbitrage, market analysis
  // DeFi AI
  | "dex"           // GhostSwap      — DEX liquidity pool management
  | "lend"          // GhostLend      — lending protocol management
  // Security AI
  | "security"      // GhostSecurity  — exploit/attack monitoring
  | "fraud"         // GhostFraud     — AML, anomaly detection
  // Governance AI
  | "dao";          // GhostDAO       — DAO automation, vote management

export type AgentStatus = "online" | "offline" | "degraded" | "busy";

export interface AgentDescriptor {
  id:          AgentRole;
  name:        string;
  description: string;
  status:      AgentStatus;
  taskCount:   number;
  lastTaskAt:  number;   // Unix ms
  capabilities: string[];
}

// ─── Tasks ───────────────────────────────────────────────────────────────────

export type TaskType =
  // Core
  | "analyze-ecosystem"    | "design-upgrade"     | "generate-code"
  | "deploy-contract"      | "audit-contract"     | "score-risk"
  | "draft-proposal"       | "cast-vote"
  // Infrastructure
  | "provision-vm"         | "scale-service"      | "repair-node"
  | "manage-bridge"        | "sync-layers"        | "restart-node"
  | "update-client"
  // Economic
  | "allocate-liquidity"   | "optimize-yield"     | "detect-arbitrage"
  | "forecast-economics"
  // DeFi
  | "rebalance-pool"       | "adjust-swap-fee"    | "adjust-rate"
  | "check-liquidation"
  // Security
  | "monitor-attacks"      | "block-contract"     | "detect-anomaly"
  | "aml-scan"             | "fraud-pattern"
  // Governance
  | "propose-upgrade"      | "analyze-vote"       | "enforce-constitution";

export type TaskPriority = "low" | "normal" | "high" | "critical";

export interface SwarmTask {
  id:          string;
  type:        TaskType;
  priority:    TaskPriority;
  payload:     Record<string, unknown>;
  targetRole?: AgentRole;
  createdAt:   number;
  deadline:    number;
}

export interface TaskResult {
  taskId:     string;
  agentId:    AgentRole;
  output:     Record<string, unknown>;
  durationMs: number;
  success:    boolean;
  error?:     string;
}

// ─── Message Bus ─────────────────────────────────────────────────────────────

export type BusEventType =
  | "task:submitted"   | "task:completed"   | "task:failed"
  | "agent:online"     | "agent:offline"    | "agent:degraded"
  | "workflow:started" | "workflow:step"    | "workflow:complete"
  | "alert:exploit"    | "alert:anomaly"    | "alert:governance";

export interface BusEvent<T = unknown> {
  id:        string;
  type:      BusEventType;
  source:    AgentRole | "orchestrator" | "bus";
  payload:   T;
  timestamp: number;
}

// ─── Workflows ───────────────────────────────────────────────────────────────

export type WorkflowType =
  | "upgrade-cycle"       // Architect → Executor → Auditor → Governor
  | "security-incident"   // Security → Fraud → Governor → Infra
  | "economic-rebalance"  // Market → Treasury → Dex → Lend
  | "node-repair";        // Node → Infra → Network

export interface WorkflowStep {
  agent:    AgentRole;
  task:     TaskType;
  payload:  Record<string, unknown>;
}

export interface WorkflowRun {
  id:       string;
  type:     WorkflowType;
  steps:    WorkflowStep[];
  results:  TaskResult[];
  status:   "running" | "complete" | "failed";
  startedAt: number;
}

// ─── Zod schemas ─────────────────────────────────────────────────────────────

export const AGENT_ROLES = [
  "architect","executor","auditor","governor",
  "infra","network","node","contract",
  "treasury","market","dex","lend",
  "security","fraud","dao",
] as const;

export const TASK_TYPES = [
  "analyze-ecosystem","design-upgrade","generate-code",
  "deploy-contract","audit-contract","score-risk",
  "draft-proposal","cast-vote",
  "provision-vm","scale-service","repair-node",
  "manage-bridge","sync-layers","restart-node","update-client",
  "allocate-liquidity","optimize-yield","detect-arbitrage","forecast-economics",
  "rebalance-pool","adjust-swap-fee","adjust-rate","check-liquidation",
  "monitor-attacks","block-contract","detect-anomaly","aml-scan","fraud-pattern",
  "propose-upgrade","analyze-vote","enforce-constitution",
] as const;

export const SubmitTaskSchema = z.object({
  type:       z.enum(TASK_TYPES),
  priority:   z.enum(["low","normal","high","critical"]).default("normal"),
  payload:    z.record(z.unknown()).default({}),
  targetRole: z.enum(AGENT_ROLES).optional(),
  deadlineMs: z.number().int().min(1000).max(600_000).default(30_000),
});

export const StartWorkflowSchema = z.object({
  type:    z.enum(["upgrade-cycle","security-incident","economic-rebalance","node-repair"]),
  payload: z.record(z.unknown()).default({}),
});

export type SubmitTaskInput    = z.infer<typeof SubmitTaskSchema>;
export type StartWorkflowInput = z.infer<typeof StartWorkflowSchema>;
