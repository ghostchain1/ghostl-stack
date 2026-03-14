/**
 * GhostStack AI Swarm — shared types
 */

// ── Agent identity ───────────────────────────────────────────────────────────
export type AgentName =
  | "builder"
  | "auditor"
  | "defender"
  | "optimizer"
  | "infra"
  | "governance"
  | "treasury";

export type AgentStatus = "idle" | "running" | "error" | "degraded";

export interface AgentDescriptor {
  name: AgentName;
  status: AgentStatus;
  lastRun: string | null;
  lastError: string | null;
  tasksProcessed: number;
}

// ── Swarm bus event map ──────────────────────────────────────────────────────
export interface SwarmEventMap {
  "build-code":       BuildTask;
  "audit-code":       AuditTask;
  "security-alert":   SecurityAlert;
  "optimize-system":  OptimizeTask;
  "infra-repair":     InfraRepairTask;
  "governance-action": GovernanceTask;
  "treasury-action":  TreasuryTask;
}

export type SwarmEventName = keyof SwarmEventMap;

// ── Task payloads ────────────────────────────────────────────────────────────
export interface BuildTask {
  target: string;        // e.g. "ghostchain", "ghost-ai-swarm", contract path
  dryRun?: boolean;
}

export interface AuditTask {
  target: string;        // service name / contract file
  deep?: boolean;
}

export interface SecurityAlert {
  source: string;        // originating service
  severity: "low" | "medium" | "high" | "critical";
  detail: string;
}

export interface OptimizeTask {
  target?: string;       // specific service, or omit for global
}

export interface InfraRepairTask {
  layer?: "L1" | "L2" | "L3";
  target?: string;       // container / VM name
}

export interface GovernanceTask {
  kind: string;          // proposal kind
  payload: Record<string, unknown>;
}

export interface TreasuryTask {
  action: "audit" | "rebalance" | "report";
  token?: string;
}

// ── Agent action result ──────────────────────────────────────────────────────
export interface AgentResult {
  agent: AgentName;
  ok: boolean;
  dryRun: boolean;
  detail: string;
  ts: string;
}

// ── HTTP helpers ─────────────────────────────────────────────────────────────
export interface UpstreamResponse {
  ok: boolean;
  status: number;
  body: unknown;
}
