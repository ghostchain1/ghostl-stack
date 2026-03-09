/**
 * GhostBrain Agent — Docker Monitor
 *
 * Queries local Docker Engine API via Unix socket for container resource usage.
 * Calculates CPU % from delta of cpu_stats relative to system CPU time.
 */

import { request } from "undici";

export interface ContainerInfo {
  id: string;
  name: string;
  image: string;
  status: string;
  cpuPercent: number;
  memUsedMb: number;
  memLimitMb: number;
  memPercent: number;
  restartCount: number;
  healthy: boolean;
}

const DOCKER_SOCKET = process.env.DOCKER_SOCKET ?? "/var/run/docker.sock";
const SOCKET_URL    = `unix://${DOCKER_SOCKET}`;

interface DockerContainer {
  Id: string;
  Names: string[];
  Image: string;
  Status: string;
  RestartCount?: number;
  State?: string;
  Health?: { Status?: string };
}

interface DockerStats {
  cpu_stats: {
    cpu_usage: { total_usage: number };
    system_cpu_usage?: number;
    online_cpus?: number;
  };
  precpu_stats: {
    cpu_usage: { total_usage: number };
    system_cpu_usage?: number;
  };
  memory_stats: {
    usage?: number;
    limit?: number;
  };
}

async function fetchJson<T>(path: string): Promise<T | null> {
  try {
    const res = await request(`${SOCKET_URL}${path}`, {
      method: "GET",
      headers: { Accept: "application/json" },
      bodyTimeout: 6_000,
    });
    if (res.statusCode !== 200) return null;
    return await res.body.json() as T;
  } catch {
    return null;
  }
}

function calcCpuPercent(stats: DockerStats): number {
  const cpuDelta    = stats.cpu_stats.cpu_usage.total_usage - stats.precpu_stats.cpu_usage.total_usage;
  const systemDelta = (stats.cpu_stats.system_cpu_usage ?? 0) - (stats.precpu_stats.system_cpu_usage ?? 0);
  const numCpus     = stats.cpu_stats.online_cpus ?? 1;
  if (systemDelta <= 0 || cpuDelta < 0) return 0;
  return Math.min(100, (cpuDelta / systemDelta) * numCpus * 100);
}

export async function collectContainerInfo(): Promise<ContainerInfo[]> {
  const containers = await fetchJson<DockerContainer[]>("/containers/json?all=false");
  if (!containers) return [];

  const results: ContainerInfo[] = [];
  for (const c of containers) {
    const stats = await fetchJson<DockerStats>(`/containers/${c.Id}/stats?stream=false`);
    const cpuPercent = stats ? calcCpuPercent(stats) : 0;
    const memUsed    = stats?.memory_stats.usage  ?? 0;
    const memLimit   = stats?.memory_stats.limit  ?? 0;
    results.push({
      id:           c.Id.slice(0, 12),
      name:         c.Names?.[0]?.replace(/^\//, "") ?? c.Id.slice(0, 12),
      image:        c.Image,
      status:       c.Status,
      cpuPercent,
      memUsedMb:    Math.round(memUsed  / 1024 / 1024),
      memLimitMb:   Math.round(memLimit / 1024 / 1024),
      memPercent:   memLimit > 0 ? (memUsed / memLimit) * 100 : 0,
      restartCount: c.RestartCount ?? 0,
      healthy:      (c.State === "running") && (c.Health?.Status !== "unhealthy"),
    });
  }
  return results;
}

export async function containerHealth(nameOrId: string): Promise<{ healthy: boolean; status: string }> {
  const info = await fetchJson<{ State?: { Status?: string; Health?: { Status?: string } } }>(
    `/containers/${nameOrId}/json`
  );
  if (!info) return { healthy: false, status: "not_found" };
  const status = info.State?.Status ?? "unknown";
  const health = info.State?.Health?.Status;
  return {
    healthy: status === "running" && health !== "unhealthy",
    status: health ? `${status}/${health}` : status,
  };
}
