/**
 * types.ts — Shared domain types for the GhostBrain Orchestrator.
 *
 * All GhostChain-specific identifiers (chain IDs, roles, statuses) are
 * derived from the canonical values in ghost-brain-core/orchestrator/types.ts.
 */

// ── Chain / Node ──────────────────────────────────────────────────────────────

export type ChainId = 14000101 | 901 | 903;
export type ChainLayer = "l1" | "l2" | "l3";

export type NodeRole =
  | "l1"
  | "l2"
  | "l3"
  | "sequencer"
  | "batcher"
  | "validator"
  | "ai_compute"
  | "rpc_proxy";

export type NodeStatus = "healthy" | "degraded" | "offline" | "unknown";

export interface ChainHealth {
  layer:       ChainLayer;
  chainId:     ChainId;
  blockNumber: number;
  peers:       number;
  syncing:     boolean;
  latencyMs:   number;
  ok:          boolean;
  checkedAt:   number;
  error?:      string;
}

export interface OrchestratorNode {
  id:          string;
  role:        NodeRole;
  endpoint:    string;
  status:      NodeStatus;
  latencyMs:   number;
  blockNumber: number;
  lastChecked: number;
  error?:      string;
}

// ── Container / Infrastructure ────────────────────────────────────────────────

export interface ContainerInfo {
  id:           string;
  name:         string;
  image:        string;
  status:       string;
  state:        string;
  cpuPercent?:  number;
  memUsedMb?:   number;
  restartCount: number;
  hostUrl:      string;
}

export interface InfraReport {
  containers: ContainerInfo[];
  totalUp:    number;
  totalDown:  number;
  scannedAt:  number;
}

// ── Validator ─────────────────────────────────────────────────────────────────

export interface ValidatorStatus {
  address:      string;
  moniker:      string;
  power:        bigint;
  jailed:       boolean;
  uptime:       number;     // 0–100 percent
  missedBlocks: number;
  checkedAt:    number;
}

// ── Anomaly detection ─────────────────────────────────────────────────────────

export type AnomalySeverity = "info" | "warning" | "critical";

export type AnomalyType =
  | "node_down"
  | "high_block_lag"
  | "validator_jailed"
  | "low_participation"
  | "container_restart_loop"
  | "tps_spike"
  | "tps_drop"
  | "memory_pressure"
  | "unknown";

export interface AnomalyEvent {
  id:          string;
  severity:    AnomalySeverity;
  type:        AnomalyType;
  details:     string;
  detectedAt:  number;
  resolved:    boolean;
  resolvedAt?: number;
}

// ── Scaling / Governance proposals ────────────────────────────────────────────

export type ScalingAction = "scale_up" | "scale_down" | "rebalance" | "none";

export interface ScalingProposal {
  id:                  string;
  action:              ScalingAction;
  reason:              string;
  targetCount:         number;
  currentCount:        number;
  requiresGovernance:  boolean;
  sentToRelay:         boolean;
  relayResponse?:      string;
  proposedAt:          number;
}

// ── Actions ───────────────────────────────────────────────────────────────────

export interface ActionResult {
  ok:         boolean;
  message:    string;
  durationMs: number;
  timestamp:  number;
}

// ── Orchestrator state snapshot ───────────────────────────────────────────────

export interface OrchestratorSnapshot {
  tick:            number;
  timestamp:       number;
  chains:          ChainHealth[];
  nodes:           OrchestratorNode[];
  validators:      ValidatorStatus[];
  infra:           InfraReport;
  anomalies:       AnomalyEvent[];
  recentProposals: ScalingProposal[];
  nodesHealthy:    number;
  nodesDegraded:   number;
  nodesOffline:    number;
}
