/**
 * vmManager.ts — GhostStack Hypervisor Control Layer
 * Manages lifecycle of KVM/QEMU VMs running the GhostStack ecosystem.
 */

import { v4 as uuid } from "uuid";

export type VmState  = "creating" | "running" | "stopped" | "destroying" | "snapshotting" | "errored";
export type VmRole   = "ghostchain-validator" | "ghostl2-node" | "ghostl3-node" | "ghostbrain" | "monitoring" | "ai-engine" | "general";
export type VmAction = "start" | "stop" | "restart" | "destroy" | "snapshot";

export interface VmSnapshot {
  id:        string;
  vmId:      string;
  name:      string;
  sizeMB:    number;
  createdAt: number;
}

export interface GhostVM {
  id:          string;
  name:        string;
  role:        VmRole;
  state:       VmState;
  cpuCores:    number;
  ramGB:       number;
  diskGB:      number;
  ip:          string;
  hypervisor:  string;
  os:          string;
  uptime:      number;        // seconds
  cpuPct:      number;
  memPct:      number;
  snapshots:   VmSnapshot[];
  createdAt:   number;
  lastActivity:number;
}

export interface VmActionResult {
  vmId:    string;
  action:  VmAction;
  status:  "accepted" | "failed";
  message: string;
  at:      number;
}

// ── Seeded VM fleet ───────────────────────────────────────────────────────────
const SEED: Array<Omit<GhostVM, "uptime" | "cpuPct" | "memPct" | "lastActivity" | "snapshots">> = [
  { id: "vm-gc-val-1",  name: "ghost-chain-validator-1", role: "ghostchain-validator", state: "running", cpuCores: 4,  ramGB: 8,  diskGB: 200, ip: "192.168.10.11", hypervisor: "kvm", os: "Ubuntu 22.04 LTS", createdAt: Date.now() - 86400000 * 60 },
  { id: "vm-gc-val-2",  name: "ghost-chain-validator-2", role: "ghostchain-validator", state: "running", cpuCores: 4,  ramGB: 8,  diskGB: 200, ip: "192.168.10.12", hypervisor: "kvm", os: "Ubuntu 22.04 LTS", createdAt: Date.now() - 86400000 * 60 },
  { id: "vm-gc-val-3",  name: "ghost-chain-validator-3", role: "ghostchain-validator", state: "running", cpuCores: 4,  ramGB: 8,  diskGB: 200, ip: "192.168.10.13", hypervisor: "kvm", os: "Ubuntu 22.04 LTS", createdAt: Date.now() - 86400000 * 30 },
  { id: "vm-gc-val-4",  name: "ghost-chain-validator-4", role: "ghostchain-validator", state: "stopped", cpuCores: 4,  ramGB: 8,  diskGB: 200, ip: "192.168.10.14", hypervisor: "kvm", os: "Ubuntu 22.04 LTS", createdAt: Date.now() - 86400000 * 30 },
  { id: "vm-l2-node",   name: "ghost-l2-node",           role: "ghostl2-node",        state: "running", cpuCores: 8,  ramGB: 16, diskGB: 500, ip: "192.168.10.20", hypervisor: "kvm", os: "Ubuntu 22.04 LTS", createdAt: Date.now() - 86400000 * 45 },
  { id: "vm-l3-node",   name: "ghost-l3-node",           role: "ghostl3-node",        state: "running", cpuCores: 8,  ramGB: 16, diskGB: 500, ip: "192.168.10.21", hypervisor: "kvm", os: "Ubuntu 22.04 LTS", createdAt: Date.now() - 86400000 * 20 },
  { id: "vm-brain",     name: "ghostbrain-core",         role: "ghostbrain",          state: "running", cpuCores: 16, ramGB: 32, diskGB: 1000,ip: "192.168.10.30", hypervisor: "kvm", os: "Ubuntu 22.04 LTS", createdAt: Date.now() - 86400000 * 90 },
  { id: "vm-monitor",   name: "ghost-monitoring",        role: "monitoring",          state: "running", cpuCores: 4,  ramGB: 8,  diskGB: 200, ip: "192.168.10.40", hypervisor: "kvm", os: "Ubuntu 22.04 LTS", createdAt: Date.now() - 86400000 * 90 },
  { id: "vm-ai-shard1", name: "ghost-ai-cluster-1",     role: "ai-engine",           state: "running", cpuCores: 32, ramGB: 64, diskGB: 2000,ip: "192.168.10.50", hypervisor: "kvm", os: "Ubuntu 22.04 LTS", createdAt: Date.now() - 86400000 * 14 },
];

const vms: Map<string, GhostVM> = new Map(
  SEED.map((s) => [
    s.id,
    {
      ...s,
      uptime:       s.state === "running" ? Math.floor(Math.random() * 86400 * 30) : 0,
      cpuPct:       s.state === "running" ? 15 + Math.random() * 40 : 0,
      memPct:       s.state === "running" ? 30 + Math.random() * 40 : 0,
      snapshots:    [],
      lastActivity: Date.now(),
    },
  ])
);

const actionLog: VmActionResult[] = [];

// ── Exports ───────────────────────────────────────────────────────────────────

export function getVMs(role?: VmRole, state?: VmState): GhostVM[] {
  return [...vms.values()].filter(
    (v) => (!role || v.role === role) && (!state || v.state === state)
  );
}

export function getVM(id: string): GhostVM | undefined {
  return vms.get(id);
}

export function getVmStats() {
  const all = [...vms.values()];
  const running = all.filter((v) => v.state === "running").length;
  const totalCpu  = all.filter((v) => v.state === "running").reduce((s, v) => s + v.cpuCores, 0);
  const totalRam  = all.filter((v) => v.state === "running").reduce((s, v) => s + v.ramGB, 0);
  return {
    total:     all.length,
    running,
    stopped:   all.filter((v) => v.state === "stopped").length,
    errored:   all.filter((v) => v.state === "errored").length,
    totalCpuCores: all.reduce((s, v) => s + v.cpuCores, 0),
    totalRamGB:    all.reduce((s, v) => s + v.ramGB, 0),
    allocatedCpuCores: totalCpu,
    allocatedRamGB:    totalRam,
    avgCpuPct: running ? all.filter((v) => v.state === "running").reduce((s, v) => s + v.cpuPct, 0) / running : 0,
    avgMemPct: running ? all.filter((v) => v.state === "running").reduce((s, v) => s + v.memPct, 0) / running : 0,
  };
}

export async function createVM(
  name: string,
  role: VmRole,
  cpuCores: number,
  ramGB: number,
  diskGB: number
): Promise<GhostVM> {
  const id = `vm-${uuid().slice(0, 8)}`;
  const ipSuffix = 100 + vms.size;
  const vm: GhostVM = {
    id,
    name,
    role,
    state:       "creating",
    cpuCores,
    ramGB,
    diskGB,
    ip:          `192.168.10.${ipSuffix}`,
    hypervisor:  "kvm",
    os:          "Ubuntu 22.04 LTS",
    uptime:      0,
    cpuPct:      0,
    memPct:      0,
    snapshots:   [],
    createdAt:   Date.now(),
    lastActivity:Date.now(),
  };
  vms.set(id, vm);
  // Simulate async provisioning
  setTimeout(() => {
    const v = vms.get(id);
    if (v) { v.state = "running"; v.uptime = 0; v.cpuPct = 10; v.memPct = 25; }
  }, 3000);
  return vm;
}

export async function performVmAction(id: string, action: VmAction): Promise<VmActionResult> {
  const vm = vms.get(id);
  if (!vm) {
    const r: VmActionResult = { vmId: id, action, status: "failed", message: "VM not found", at: Date.now() };
    actionLog.push(r);
    return r;
  }
  switch (action) {
    case "start":
      if (vm.state === "running") break;
      vm.state = "running"; vm.uptime = 0; vm.cpuPct = 10; vm.memPct = 25;
      break;
    case "stop":
      vm.state = "stopped"; vm.uptime = 0; vm.cpuPct = 0; vm.memPct = 0;
      break;
    case "restart":
      vm.state = "stopped";
      setTimeout(() => { vm.state = "running"; vm.uptime = 0; vm.cpuPct = 12; vm.memPct = 28; }, 2000);
      break;
    case "destroy":
      vm.state = "destroying";
      setTimeout(() => { vms.delete(id); }, 2000);
      break;
    case "snapshot": {
      vm.state = "snapshotting";
      const snap: VmSnapshot = { id: uuid(), vmId: id, name: `snap-${Date.now()}`, sizeMB: vm.diskGB * 200, createdAt: Date.now() };
      vm.snapshots.push(snap);
      setTimeout(() => { vm.state = "running"; }, 1500);
      break;
    }
  }
  vm.lastActivity = Date.now();
  const r: VmActionResult = { vmId: id, action, status: "accepted", message: `VM ${action} accepted`, at: Date.now() };
  actionLog.push(r);
  return r;
}

export function getVmActionLog(): VmActionResult[] {
  return actionLog.slice(-100);
}

export function tickVmTelemetry(): void {
  for (const vm of vms.values()) {
    if (vm.state !== "running") continue;
    vm.uptime   += 60;
    vm.cpuPct    = Math.max(5, Math.min(95, vm.cpuPct + (Math.random() - 0.48) * 6));
    vm.memPct    = Math.max(10, Math.min(90, vm.memPct + (Math.random() - 0.46) * 3));
    vm.lastActivity = Date.now();
  }
}
