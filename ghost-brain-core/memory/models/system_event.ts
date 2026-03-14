/**
 * GhostBrain Memory Engine — System Event Types
 *
 * Discriminated union of every structured event the Memory Engine can record.
 * Add new variants here; the category field drives pattern detection.
 */

// ---------------------------------------------------------------------------
// Category enumeration (string literals for JSONL portability)
// ---------------------------------------------------------------------------

export type EventCategory =
  | "docker_failure"
  | "docker_restart"
  | "docker_oom"
  | "docker_exit"
  | "vm_crash"
  | "vm_restart"
  | "vm_start"
  | "vm_offline"
  | "hypervisor_load"
  | "hypervisor_mem"
  | "network_degraded"
  | "network_error_spike"
  | "l2_lag"
  | "governance_event"
  | "risk_alert"
  | "cpu_scale"
  | "mem_scale"
  | "anomaly_detected"
  | "repair_success"
  | "repair_failed"
  | "prediction_alert";

// ---------------------------------------------------------------------------
// Per-category payload types
// ---------------------------------------------------------------------------

export interface DockerFailurePayload {
  containerName: string;
  reason: string;
  exitCode?: number;
  attemptCount?: number;
}

export interface VMPayload {
  vmName: string;
  previousState?: string;
  newState?: string;
  reason?: string;
  attemptCount?: number;
}

export interface HypervisorPayload {
  loadAvg1m: number;
  loadAvg5m: number;
  memUsedPct: number;
  cpuCount: number;
  threshold: number;
}

export interface NetworkPayload {
  iface: string;
  errorRate: number;
  rxErrors: number;
  txErrors: number;
  threshold: number;
}

export interface L2LagPayload {
  lagBlocks: number;
  l2Block: number;
  l1CommittedBlock: number;
  threshold: number;
}

export interface GovernancePayload {
  kind: string;
  txHash: string;
  blockNumber: number;
  chainId: number;
}

export interface RiskPayload {
  riskScore: number;
  source: string;
  threshold: number;
}

export interface ScalePayload {
  resource: "cpu" | "mem";
  currentPct: number;
  threshold: number;
  action: "scale_up" | "scale_down";
}

export interface AnomalyPayload {
  metric: string;
  value: number;
  zScore: number;
  severity: "low" | "medium" | "high";
}

export interface RepairPayload {
  target: string;
  kind: string;
  durationMs?: number;
  error?: string;
}

export interface PredictionPayload {
  category: EventCategory;
  confidence: number;
  occurrencesInWindow: number;
  windowMs: number;
  message: string;
}

// ---------------------------------------------------------------------------
// Generic fallback for any unstructured data
// ---------------------------------------------------------------------------

export interface GenericPayload {
  [key: string]: unknown;
}

// ---------------------------------------------------------------------------
// Union type: payload mapped to its category
// ---------------------------------------------------------------------------

export type EventPayloadMap = {
  docker_failure: DockerFailurePayload;
  docker_restart: DockerFailurePayload;
  docker_oom: DockerFailurePayload;
  docker_exit: DockerFailurePayload;
  vm_crash: VMPayload;
  vm_restart: VMPayload;
  vm_start: VMPayload;
  vm_offline: VMPayload;
  hypervisor_load: HypervisorPayload;
  hypervisor_mem: HypervisorPayload;
  network_degraded: NetworkPayload;
  network_error_spike: NetworkPayload;
  l2_lag: L2LagPayload;
  governance_event: GovernancePayload;
  risk_alert: RiskPayload;
  cpu_scale: ScalePayload;
  mem_scale: ScalePayload;
  anomaly_detected: AnomalyPayload;
  repair_success: RepairPayload;
  repair_failed: RepairPayload;
  prediction_alert: PredictionPayload;
};

/**
 * A fully-typed system event using conditional payload types.
 * `source` identifies the controller or module emitting the event.
 */
export type SystemEvent<C extends EventCategory = EventCategory> = {
  category: C;
  source: string;
  data: C extends keyof EventPayloadMap ? EventPayloadMap[C] : GenericPayload;
};
