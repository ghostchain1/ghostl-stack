// types.ts — shared type definitions for autonomous-vault-hypervisor

export type Layer = 'L0' | 'L1' | 'L2' | 'L3';

export type VmState = 'running' | 'shut off' | 'paused' | 'crashed' | 'unknown';
export type ContainerState = 'running' | 'exited' | 'paused' | 'created' | 'restarting' | 'dead' | 'removing' | 'unknown';

export interface VmInfo {
  id: string;
  name: string;
  state: VmState;
  layer: Layer;
  managedBy: string;
  lastSeen: string;
}

export interface ContainerInfo {
  id: string;
  name: string;
  image: string;
  state: ContainerState;
  status: string;
  ports: string;
  restartCount: number;
  lastSeen: string;
}

export interface SecretRotationRule {
  mount: string;
  path: string;
  kvVersion: 2 | 1;
  keys: string[];
  encoding: 'base64' | 'hex';
  intervalMinutes: number;
  _lastRotated?: number;
}

export interface PolicyRule {
  type: 'vm' | 'container' | 'secret' | 'network';
  action: string;
  target?: string;
  layer?: Layer | '*';
  allow: boolean;
  reason?: string;
}

export interface HypervisorConfig {
  sshHost: string;
  sshUser: string;
  sshKey: string;
  sshPort: number;
  layers: Record<string, Layer>;
}

export interface ReconcileState {
  vms: Map<string, VmInfo>;
  containers: Map<string, ContainerInfo>;
  lastReconciled: number;
  lastVmDiscovery: number;
  lastContainerDiscovery: number;
  remediations: RemediationEvent[];
}

export interface RemediationEvent {
  ts: number;
  type: 'vm_restart' | 'container_restart' | 'secret_rotation' | 'vm_start' | 'container_start';
  target: string;
  reason: string;
  outcome: 'success' | 'failed' | 'skipped' | 'policy_denied';
  details?: Record<string, unknown>;
}

export interface AuditEvent {
  ts: number;
  requestId: string;
  type: string;
  actor: string;
  target: string;
  decision: 'allow' | 'deny';
  reason: string;
  layer?: Layer;
}

export interface HealthSignal {
  signalId: string;
  source: 'nats' | 'manual' | 'heartbeat';
  service: string;
  layer: Layer;
  metric?: string;
  value?: number;
  logLine?: string;
  observedAt: string;
  anomaly: boolean;
}

// ─── Memory Swap System ───────────────────────────────────────────────────────

export type WorkloadKind = 'container' | 'vm';

/** Per-workload memory profile collected during the pressure-sampling phase. */
export interface WorkloadMemoryProfile {
  kind:           WorkloadKind;
  id:             string;
  name:           string;
  layer:          'L1' | 'L2' | 'L3';
  memUsageMiB:    number;
  memLimitMiB:    number;
  /** Fraction of memory limit consumed [0, 1]. */
  pressureRatio:  number;
  /** Unix ms of last observed I/O or network activity. */
  lastActivityMs: number;
  restartCount:   number;
  /** Whether policy allows this workload to be swap-reduced. */
  swappable:      boolean;
}

/** Signal published to GhostBrain Core when memory pressure is observed. */
export interface MemoryPressureSignal {
  signalId:       string;
  source:         'host' | 'container' | 'vm';
  workloadId:     string;
  workloadName:   string;
  layer:          'L1' | 'L2' | 'L3';
  memUsageMiB:    number;
  memTotalMiB:    number;
  /** Host-wide pressure ratio [0, 1]. */
  pressureRatio:  number;
  /** Current swap partition usage ratio [0, 1]. */
  swapUsageRatio: number;
  anomaly:        boolean;
  observedAt:     string;
  /** Detailed per-workload profiles included in host-level signals. */
  profiles:       WorkloadMemoryProfile[];
}

/** Directive sent by GhostBrain Core ordering a specific swap action. */
export interface SwapDirective {
  directiveId:    string;
  sourceLayer:    'L1' | 'L2' | 'L3';
  targetLayer:    'L1' | 'L2' | 'L3';
  workloadId:     string;
  workloadName:   string;
  kind:           WorkloadKind;
  action:         'memory_limit_reduce' | 'vm_balloon_reduce' | 'container_pause' | 'skip';
  currentMemMiB:  number;
  pressureRatio:  number;
  lastActivityMs: number;
  /** AI-computed priority score from the advisor. */
  aiScore:        number;
  issuedAt:       string;
}

/** Outcome record for each swap operation — written to audit log and NATS. */
export interface SwapOutcome {
  swapId:       string;
  workloadId:   string;
  workloadName: string;
  layer:        'L1' | 'L2' | 'L3';
  action:       string;
  score:        number;
  reclaimedMiB: number;
  success:      boolean;
  reason:       string;
  durationMs:   number;
  executedAt:   string;
}

export interface GhostBrainEnvelope<T = unknown> {
  messageId: string;
  subject: string;
  correlationId: string;
  senderAgentId: string;
  payload: T;
  sentAt: string;
}

export interface Metrics {
  reconcileRuns: number;
  vmDiscoveries: number;
  containerDiscoveries: number;
  vmRemediations: number;
  containerRemediations: number;
  secretRotations: number;
  secretRotationFails: number;
  policyDenials: number;
  authFailures: number;
  anomalies: number;
  natsPublished: number;
  natsErrors: number;
  apiRequests: number;
  // Memory swap system
  memoryPressureSamples?: number;
  memorySwapsExecuted?: number;
  memorySwapFailures?: number;
  memoryPressurePublished?: number;
}
