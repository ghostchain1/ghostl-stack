// Infrastructure data service — proxies to HCL (port 9986)

export interface VMInfo {
  id:     string;
  name:   string;
  state:  "running" | "stopped" | "paused" | "error";
  cpuPct: number;
  memMB:  number;
  diskGB: number;
  os:     string;
  ip:     string;
}

export interface ContainerInfo {
  id:     string;
  name:   string;
  image:  string;
  state:  "running" | "exited" | "paused";
  cpuPct: number;
  memMB:  number;
  ports:  string[];
  uptime: string;
}

export interface ResourceSummary {
  totalCpuCores:  number;
  usedCpuPct:     number;
  totalMemGB:     number;
  usedMemGB:      number;
  totalDiskTB:    number;
  usedDiskTB:     number;
  networkInMbps:  number;
  networkOutMbps: number;
}

export interface InfraSnapshot {
  vms:        VMInfo[];
  containers: ContainerInfo[];
  resources:  ResourceSummary | null;
  hclOnline:  boolean;
  timestamp:  number;
}

export async function getInfrastructure(): Promise<InfraSnapshot> {
  const res = await fetch("/api/infra/status", { cache: "no-store" });
  if (!res.ok) throw new Error(`infra/status ${res.status}`);
  return res.json();
}

export async function restartNode(nodeId: string): Promise<{ success: boolean; message: string }> {
  const res = await fetch("/api/infra/restart", {
    method:  "POST",
    headers: { "Content-Type": "application/json" },
    body:    JSON.stringify({ nodeId }),
  });
  return res.json();
}
