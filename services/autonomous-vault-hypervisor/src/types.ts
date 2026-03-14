// types.ts — shared type definitions for autonomous-vault-hypervisor

export type GhostLayer = 'L0' | 'L1' | 'L2' | 'L3';

export type VmState = 'running' | 'shut off' | 'paused' | 'crashed' | 'unknown';
export type ContainerState = 'running' | 'exited' | 'paused' | 'created' | 'restarting' | 'dead' | 'removing' | 'unknown';

export interface VmInfo {
  id: string;
  name: string;
  state: VmState;
  layer: GhostLayer;
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

export interface RemediationEvent {
  ts: number;
  type: string;
  target: string;
  reason: string;
  outcome: 'success' | 'failed' | 'policy_denied';
}

export interface ReconcilerState {
  vms: Map<string, VmInfo>;
  containers: Map<string, ContainerInfo>;
  lastReconciled: number;
  lastVmDiscovery: number;
  lastContainerDiscovery: number;
  remediations: RemediationEvent[];
}

export interface PolicyRule {
  action?: string;
  target?: string;
  layer?: string;
  reason?: string;
}

export interface RotationRule {
  mount: string;
  path: string;
  kvVersion?: 1 | 2;
  keys?: string[];
  encoding?: 'hex' | 'base64';
  keyLength?: number;
  intervalMinutes?: number;
  _lastRotated?: number;
}

export interface Policy {
  allowActions: PolicyRule[];
  denyActions: PolicyRule[];
  emergencyLock: boolean;
  maxAutoRestarts: { vms: number; containers: number };
  rotations: RotationRule[];
}

export interface HealthSignal {
  signalId: string;
  source: string;
  service: string;
  layer: string;
  metric: string;
  value: number;
  threshold?: number;
  observedAt: string;
  anomaly: boolean;
}

export interface MemorySwapDirective {
  directiveId: string;
  workloadId: string;
  action: 'swap_out' | 'swap_in' | 'compact' | 'query';
  targetVm?: string;
  swapAmountMiB?: number;
}

export interface MemorySwapOutcome {
  directiveId: string;
  workloadId: string;
  action: string;
  ok: boolean;
  detail?: string;
  executedAt: string;
}
