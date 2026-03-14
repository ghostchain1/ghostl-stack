/**
 * GhostBrain Swarm AI — Event Channel Types
 *
 * Canonical topic names and typed payloads for the inter-agent message bus.
 * Every message on the AgentBus carries one of these typed envelopes so
 * subscribers never receive untyped `any` data.
 */

import type { EventCategory } from "../../memory/models/system_event.js";
import type { PatternMatch }   from "../../memory/learning/pattern_detector.js";
import type { PredictionAlert } from "../../memory/learning/failure_predictor.js";

// ---------------------------------------------------------------------------
// Topics
// ---------------------------------------------------------------------------

export type SwarmTopic =
  // Published by agents reporting their own health status each tick.
  | "agent:status"
  // Published by InfrastructureAI when it detects a node in trouble.
  | "infra:node_alert"
  // Published by InfrastructureAI after an automated repair attempt.
  | "infra:repair_result"
  // Published by SecurityAI when the risk score breaches a threshold.
  | "security:risk_alert"
  // Published by NetworkAI when interface error rate spikes.
  | "network:degraded"
  // Published by NetworkAI with a suggested rebalance target.
  | "network:rebalance"
  // Published by TreasuryAI when L1 or L2 chain health looks anomalous.
  | "treasury:chain_alert"
  // Published by ArchitectAI with pattern-backed architectural concerns.
  | "arch:concern"
  // Published by CompilerAI when the compiler daemon is unhealthy.
  | "compiler:health"
  // Published by any agent to request a governance proposal.
  | "governance:propose"
  // Published by ConsensusEngine with the final agreed action set each tick.
  | "consensus:actions";

// ---------------------------------------------------------------------------
// Per-topic payload types
// ---------------------------------------------------------------------------

export interface AgentStatusPayload {
  agentName:  string;
  role:       string;
  healthy:    boolean;
  message?:   string;
  durationMs: number;
}

export interface NodeAlertPayload {
  nodeName:  string;
  alertKind: "vm_offline" | "container_unhealthy" | "container_exited" | "hypervisor_overload";
  cpuPct?:   number;
  memPct?:   number;
  reason?:   string;
}

export interface RepairResultPayload {
  target:    string;
  success:   boolean;
  durationMs: number;
  error?:    string;
}

export interface RiskAlertPayload {
  source:    string;
  riskScore: number;
  threshold: number;
  details?:  Record<string, unknown>;
}

export interface NetworkDegradedPayload {
  iface:     string;
  errorRate: number;
  threshold: number;
}

export interface RebalancePayload {
  fromNode: string;
  toNode:   string;
  reason:   string;
}

export interface ChainAlertPayload {
  chainId:    number;
  kind:       "l2_lag" | "l1_unreachable" | "fee_spike";
  lagBlocks?: number;
  message:    string;
}

export interface ArchConcernPayload {
  category:    EventCategory;
  pattern:     PatternMatch;
  prediction?: PredictionAlert;
  suggestion:  string;
}

export interface CompilerHealthPayload {
  healthy:     boolean;
  httpStatus?: number;
  latencyMs:   number;
  error?:      string;
}

export interface GovernanceProposalPayload {
  type:        string;
  description: string;
  from:        string;
  metrics?:    Record<string, unknown>;
}

export interface ConsensusActionsPayload {
  tick:         number;
  agentCount:   number;
  actionCount:  number;
  actions:      ConsensusAction[];
}

export interface ConsensusAction {
  kind:        string;
  target?:     string;
  confidence:  number;    // 0.0–1.0
  priority:    number;    // higher = more urgent
  proposedBy:  string[];  // agent names that agreed
  description: string;
}

// ---------------------------------------------------------------------------
// Generic envelope
// ---------------------------------------------------------------------------

/** Map from topic to its payload type for type-safe publish/subscribe. */
export type TopicPayloadMap = {
  "agent:status":       AgentStatusPayload;
  "infra:node_alert":   NodeAlertPayload;
  "infra:repair_result": RepairResultPayload;
  "security:risk_alert": RiskAlertPayload;
  "network:degraded":   NetworkDegradedPayload;
  "network:rebalance":  RebalancePayload;
  "treasury:chain_alert": ChainAlertPayload;
  "arch:concern":       ArchConcernPayload;
  "compiler:health":    CompilerHealthPayload;
  "governance:propose": GovernanceProposalPayload;
  "consensus:actions":  ConsensusActionsPayload;
};

export interface SwarmMessage<T extends SwarmTopic = SwarmTopic> {
  topic:     T;
  from:      string;
  payload:   TopicPayloadMap[T];
  timestamp: number;
}
