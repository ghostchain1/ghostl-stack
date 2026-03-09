/**
 * Shared types for ghost-infra-controller.
 *
 * SECURITY: All names that flow into shell commands (VMName, ContainerName) are
 * constrained by SAFE_NAME_RE below and validated before every exec call.
 * Using execFile (not exec) everywhere — no shell interpolation.
 */

/** Regex that allowlists safe identifiers for use in exec arguments. */
export const SAFE_NAME_RE = /^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,63}$/;

/** Validate a name before passing to execFile. Throws on invalid input. */
export function assertSafeName(name: string, label: string): void {
  if (!SAFE_NAME_RE.test(name)) {
    throw new Error(`Unsafe ${label} name rejected: "${name}" — must match ${SAFE_NAME_RE}`);
  }
}

export type ActionRisk = "low" | "medium" | "high" | "critical";

export type ActionType =
  | "vm_start"
  | "vm_stop"
  | "vm_restart"
  | "container_restart"
  | "container_stop"
  | "node_restart"
  | "dns_reload"
  | "storage_expand"
  | "scale_up"
  | "scale_down"
  | "network_reroute";

// ---------------------------------------------------------------------------
// VM
// ---------------------------------------------------------------------------

export type VMState = "running" | "stopped" | "paused" | "crashed" | "unknown";

export interface VMInfo {
  name: string;
  id: string | null;
  state: VMState;
  vcpus?: number;
  memoryKiB?: number;
}

// ---------------------------------------------------------------------------
// Containers
// ---------------------------------------------------------------------------

export type ContainerHealth = "healthy" | "unhealthy" | "starting" | "none" | "unknown";

export interface ContainerInfo {
  id: string;
  name: string;
  image: string;
  status: string;   // raw docker status string
  health: ContainerHealth;
  running: boolean;
  restartCount: number;
}

// ---------------------------------------------------------------------------
// Blockchain nodes
// ---------------------------------------------------------------------------

export interface NodeInfo {
  name:       string;  // e.g. "ghostchain-l1", "ghostchain-l2", "ghostchain-l3"
  rpc:        string;
  chainId:    number;
  reachable:  boolean;
  blockNumber: bigint;
  peerCount:  number;
  syncLag:    number;  // estimated blocks behind head (0 = synced)
}

// ---------------------------------------------------------------------------
// Network
// ---------------------------------------------------------------------------

export interface EndpointLatency {
  host:    string;
  port:    number;
  latency: number | null;  // ms, null = unreachable
}

export interface InfraNetworkState {
  endpoints:     EndpointLatency[];
  avgLatency:    number | null;
  unreachable:   string[];
}

// ---------------------------------------------------------------------------
// Storage
// ---------------------------------------------------------------------------

export interface DiskInfo {
  mountpoint:  string;
  totalBytes:  number;
  usedBytes:   number;
  freeBytes:   number;
  usedPct:     number;
}

// ---------------------------------------------------------------------------
// Full system snapshot
// ---------------------------------------------------------------------------

export interface SystemState {
  timestamp:   number;
  cpuLoad1m:   number;   // os.loadavg()[0]
  cpuLoad5m:   number;
  cpuLoad15m:  number;
  freeMemBytes: number;
  totalMemBytes: number;
  memUsedPct:  number;
  vms:         VMInfo[];
  containers:  ContainerInfo[];
  nodes:       NodeInfo[];
  network:     InfraNetworkState;
  disks:       DiskInfo[];
}

// ---------------------------------------------------------------------------
// Infra actions
// ---------------------------------------------------------------------------

export interface InfraAction {
  id:          string;
  type:        ActionType;
  target:      string;   // VM name, container name, node name, etc.
  description: string;
  params:      Record<string, unknown>;
  timestamp:   number;
  risk:        ActionRisk;
  /**
   * When true AND ALLOW_AUTO_EXEC=true, the controller will execute the
   * action without waiting for human ratification.
   * Destructive actions (vm_stop, container_stop, scale_down) are always false.
   */
  autoExecute: boolean;
}

// ---------------------------------------------------------------------------
// Controller cycle & status
// ---------------------------------------------------------------------------

export interface ControllerCycle {
  cycleId:    string;
  startTime:  number;
  endTime?:   number;
  actions:    InfraAction[];
  executed:   string[];   // ids of auto-executed actions
  errors:     string[];
  status:     "running" | "completed" | "failed";
}

export interface ControllerStatus {
  running:       boolean;
  cycleCount:    number;
  lastCycle?:    ControllerCycle;
  totalActions:  number;
  autoExec:      boolean;
  dryRun:        boolean;
  uptimeSeconds: number;
}
