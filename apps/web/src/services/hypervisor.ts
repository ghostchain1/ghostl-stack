/**
 * hypervisor.ts — GhostBrain Hypervisor / VM / Container service client.
 *
 * Wraps BFF endpoints that proxy to the GAIS supervisor REST API on port 9100
 * and to the Docker Engine API (via the infra service).
 *
 * IMPORTANT: All write actions are gated by the kernel allowlist and
 * VM_MANAGER_DRY_RUN flag.  The UI shows DRY-RUN status prominently.
 */

export type ContainerState = 'running' | 'stopped' | 'paused' | 'restarting' | 'unknown';
export type VMState        = 'running' | 'stopped' | 'suspended' | 'rebooting' | 'unknown';

export interface ContainerInfo {
  id: string;
  name: string;
  image: string;
  state: ContainerState;
  health: 'healthy' | 'unhealthy' | 'starting' | 'none';
  cpuPercent: number;
  memMb: number;
  uptimeSec: number;
  restartCount: number;
  labels: Record<string, string>;
}

export interface VMInfo {
  id: string;
  name: string;
  state: VMState;
  cpuCount: number;
  ramMb: number;
  diskGb: number;
  uptimeSec: number;
  ipv4: string;
  tags: string[];
}

export interface HypervisorSnapshot {
  dryRunMode: boolean;
  containers: ContainerInfo[];
  vms: VMInfo[];
  totalContainers: number;
  runningContainers: number;
  totalVMs: number;
  runningVMs: number;
  region: string;
  collectedAt: string;
}

export type ContainerAction = 'start' | 'stop' | 'restart' | 'pause' | 'unpause';
export type VMAction        = 'start' | 'stop' | 'reboot' | 'suspend' | 'resume';

export interface ActionResult {
  ok: boolean;
  dryRun: boolean;
  message: string;
}

async function bff<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, { cache: 'no-store', ...init });
  if (!res.ok) throw new Error(`Hypervisor BFF ${path} → HTTP ${res.status}`);
  return res.json() as Promise<T>;
}

export async function fetchHypervisorSnapshot(): Promise<HypervisorSnapshot> {
  return bff<HypervisorSnapshot>('/api/command-center/infra');
}

/** Perform an action on a container (respects allowlist + dry-run mode). */
export async function containerAction(
  name: string,
  action: ContainerAction,
): Promise<ActionResult> {
  return bff<ActionResult>('/api/hypervisor/container/action', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, action }),
  });
}

/** Perform an action on a VM (respects allowlist + dry-run mode). */
export async function vmAction(id: string, action: VMAction): Promise<ActionResult> {
  return bff<ActionResult>('/api/hypervisor/vm/action', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id, action }),
  });
}
