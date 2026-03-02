/**
 * GhostBrain Core — Canonical type definitions
 *
 * All agents, tasks, plans, incidents, and evidence use these types.
 * The schema files in ../schemas/ mirror these for JSON Schema validation.
 */

// ─── Layers ───────────────────────────────────────────────────────────────────
export type Layer = "L1" | "L2" | "L3";

// ─── Agent roles ─────────────────────────────────────────────────────────────
export type AgentRole =
  | "sentinel"
  | "diagnostician"
  | "planner"
  | "executor"
  | "auditor"
  | "governor";

export type AgentCapability =
  | "docker.restart"
  | "docker.ps"
  | "compose.apply"
  | "compose.reconcile"
  | "compose.canary"
  | "libvirt.snapshot"
  | "libvirt.status"
  | "libvirt.start"
  | "libvirt.stop"
  | "network.firewall.read"
  | "network.dns.update"
  | "network.tls.renew"
  | "db.backup.verify"
  | "db.replication.status"
  | "db.migration.apply"
  | "vault.health"
  | "metrics.query"
  | "logs.query"
  | "policy.evaluate";

export interface AgentRegistration {
  agentId: string;
  role: AgentRole;
  capabilities: AgentCapability[];
  resourceScopes: ResourceScope[];
  natsSubject: string;
  registeredAt: string;
  lastSeen: string;
  healthy: boolean;
}

// ─── Resource scopes ─────────────────────────────────────────────────────────
export interface ResourceScope {
  type: "vm" | "stack" | "domain" | "db" | "network";
  name: string;
  layer: Layer;
}

// ─── Task tokens (capability-scoped, short-lived) ─────────────────────────────
export interface TaskToken {
  tokenId: string;
  taskId: string;
  agentId: string;
  capabilities: AgentCapability[];
  resourceScopes: ResourceScope[];
  issuedAt: number;        // unix ms
  expiresAt: number;       // unix ms
  idempotencyKey: string;
  signature: string;       // HMAC-SHA256 of payload, key in Vault
}

// ─── Incidents ────────────────────────────────────────────────────────────────
export type IncidentSeverity = "critical" | "high" | "medium" | "low";
export type IncidentStatus  = "open" | "diagnosing" | "planned" | "executing" | "resolved" | "rolled-back";

export interface Incident {
  incidentId: string;
  openedAt: string;
  updatedAt: string;
  severity: IncidentSeverity;
  status: IncidentStatus;
  title: string;
  description: string;
  signals: HealthSignal[];
  evidenceRefs: EvidenceRef[];
  planId?: string;
  resolvedAt?: string;
  rootCause?: string;
}

// ─── Health signals ───────────────────────────────────────────────────────────
export type SignalSource = "prometheus" | "loki" | "docker" | "libvirt" | "nats" | "manual";

export interface HealthSignal {
  signalId: string;
  source: SignalSource;
  service?: string;
  layer?: Layer;
  metric?: string;
  value?: number;
  threshold?: number;
  logLine?: string;
  observedAt: string;
  anomaly: boolean;
}

// ─── Change plans ─────────────────────────────────────────────────────────────
export type PolicyDecision = "ALLOW" | "DENY" | "ALLOW_WITH_CONDITIONS";
export type PlanStatus = "draft" | "approved" | "executing" | "completed" | "rolled-back" | "failed";

export interface ChangeStep {
  stepId: string;
  order: number;
  description: string;
  agentId?: string;
  capability: AgentCapability;
  target: ResourceScope;
  params: Record<string, unknown>;
  successMetrics: SuccessMetric[];
  rollbackStep?: RollbackStep;
  timeoutSeconds: number;
}

export interface RollbackStep {
  description: string;
  capability: AgentCapability;
  params: Record<string, unknown>;
}

export interface SuccessMetric {
  metric: string;
  operator: "lt" | "gt" | "eq" | "lte" | "gte";
  threshold: number;
  windowSeconds: number;
}

export interface ChangePlan {
  planId: string;
  incidentId: string;
  createdAt: string;
  status: PlanStatus;
  title: string;
  rationale: string;
  steps: ChangeStep[];
  blastRadius: number;         // number of resources affected
  canaryStep?: ChangeStep;
  policyDecision?: PolicyDecision;
  policyConditions?: string[];
  evidenceRefs: EvidenceRef[];
  executedAt?: string;
  completedAt?: string;
}

// ─── Evidence ─────────────────────────────────────────────────────────────────
export type EvidenceKind =
  | "metric_snapshot"
  | "log_excerpt"
  | "config_diff"
  | "command_transcript"
  | "health_check"
  | "slo_chart"
  | "before_after";

export interface EvidenceRef {
  evidenceId: string;
  kind: EvidenceKind;
  description: string;
  storedAt: string;          // ISO timestamp
  payload: unknown;          // redacted where needed
}

// ─── NATS message envelope ────────────────────────────────────────────────────
export interface BrainMessage<T = unknown> {
  messageId: string;
  subject: string;
  correlationId: string;
  senderAgentId: string;
  payload: T;
  sentAt: string;
}

// ─── System health graph node ─────────────────────────────────────────────────
export type NodeHealth = "healthy" | "degraded" | "down" | "unknown";

export interface HealthNode {
  nodeId: string;
  name: string;
  type: "service" | "vm" | "db" | "network" | "dns" | "chain";
  layer: Layer;
  health: NodeHealth;
  lastChecked: string;
  dependsOn: string[];       // nodeIds
  metrics: Record<string, number>;
}

export interface SystemHealthGraph {
  updatedAt: string;
  nodes: Map<string, HealthNode>;
  anomalies: string[];       // nodeIds with anomaly
}

// ─── Canary state ─────────────────────────────────────────────────────────────
export type CanaryStatus = "running" | "passed" | "failed";

export interface CanaryState {
  canaryId: string;
  planId: string;
  startedAt: string;
  windowEndsAt: string;
  status: CanaryStatus;
  baselineMetrics: Record<string, number>;
  canaryMetrics: Record<string, number>;
}
