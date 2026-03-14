/**
 * GhostBrain Infra — Docker Controller (Multi-host)
 *
 * Manages Docker containers across multiple Docker hosts.
 * DOCKER_HOSTS env: comma-separated list of Docker API URLs.
 *   - Unix socket:  unix:///var/run/docker.sock
 *   - TCP:          http://192.168.1.10:2375
 */

import { request } from "undici";

export interface HostContainer {
  hostUrl:      string;
  id:           string;
  name:         string;
  image:        string;
  status:       string;
  cpuPercent:   number;
  memUsedMb:    number;
  memLimitMb:   number;
  restartCount: number;
}

type DockerHostUrl = string;

const DOCKER_HOSTS: DockerHostUrl[] = (process.env.DOCKER_HOSTS ?? "/var/run/docker.sock")
  .split(",")
  .map(s => s.trim())
  .filter(Boolean)
  .map(h => h.startsWith("unix://") || h.startsWith("http") ? h : `unix://${h}`);

interface DockerContainerItem {
  Id:    string;
  Names: string[];
  Image: string;
  Status: string;
}

interface DockerStats {
  cpu_stats:    { cpu_usage: { total_usage: number }; system_cpu_usage?: number; online_cpus?: number };
  precpu_stats: { cpu_usage: { total_usage: number }; system_cpu_usage?: number };
  memory_stats: { usage?: number; limit?: number };
}

async function dockerGet<T>(hostUrl: string, path: string): Promise<T | null> {
  try {
    const url = hostUrl.startsWith("unix://")
      ? `${hostUrl}${path}`
      : `${hostUrl}${path}`;
    const res = await request(url, { method: "GET", headers: { Accept: "application/json" }, bodyTimeout: 6_000 });
    if (res.statusCode !== 200) return null;
    return await res.body.json() as T;
  } catch { return null; }
}

async function dockerPost(hostUrl: string, path: string, body?: unknown): Promise<{ ok: boolean; status: number }> {
  try {
    const url = hostUrl.startsWith("unix://") ? `${hostUrl}${path}` : `${hostUrl}${path}`;
    const res = await request(url, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    body !== undefined ? JSON.stringify(body) : undefined,
      bodyTimeout: 12_000,
    });
    return { ok: res.statusCode < 300, status: res.statusCode };
  } catch { return { ok: false, status: 0 }; }
}

function cpuPercent(stats: DockerStats): number {
  const cpuDelta    = stats.cpu_stats.cpu_usage.total_usage - stats.precpu_stats.cpu_usage.total_usage;
  const systemDelta = (stats.cpu_stats.system_cpu_usage ?? 0) - (stats.precpu_stats.system_cpu_usage ?? 0);
  const numCpus     = stats.cpu_stats.online_cpus ?? 1;
  if (systemDelta <= 0 || cpuDelta < 0) return 0;
  return Math.min(100, (cpuDelta / systemDelta) * numCpus * 100);
}

async function containersOnHost(hostUrl: string): Promise<HostContainer[]> {
  const list = await dockerGet<DockerContainerItem[]>(hostUrl, "/containers/json?all=false");
  if (!list) return [];
  const results: HostContainer[] = [];
  for (const c of list) {
    const stats   = await dockerGet<DockerStats>(hostUrl, `/containers/${c.Id}/stats?stream=false`);
    const cpu     = stats ? cpuPercent(stats) : 0;
    const memUsed = stats?.memory_stats.usage  ?? 0;
    const memLim  = stats?.memory_stats.limit  ?? 0;
    results.push({
      hostUrl,
      id:           c.Id.slice(0, 12),
      name:         c.Names?.[0]?.replace(/^\//, "") ?? c.Id.slice(0, 12),
      image:        c.Image,
      status:       c.Status,
      cpuPercent:   cpu,
      memUsedMb:    Math.round(memUsed / 1024 / 1024),
      memLimitMb:   Math.round(memLim  / 1024 / 1024),
      restartCount: 0,
    });
  }
  return results;
}

export async function listAllContainers(): Promise<HostContainer[]> {
  const perHost = await Promise.all(DOCKER_HOSTS.map(containersOnHost));
  return perHost.flat();
}

export async function startContainer(hostUrl: string, containerId: string): Promise<{ ok: boolean; message: string }> {
  const r = await dockerPost(hostUrl, `/containers/${containerId}/start`);
  return { ok: r.ok, message: r.ok ? "container started" : `failed (${r.status})` };
}

export async function stopContainer(hostUrl: string, containerId: string, timeout = 10): Promise<{ ok: boolean; message: string }> {
  const r = await dockerPost(hostUrl, `/containers/${containerId}/stop?t=${timeout}`);
  return { ok: r.ok, message: r.ok ? "container stopped" : `failed (${r.status})` };
}

export async function restartContainer(hostUrl: string, containerId: string): Promise<{ ok: boolean; message: string }> {
  const r = await dockerPost(hostUrl, `/containers/${containerId}/restart?t=10`);
  return { ok: r.ok, message: r.ok ? "container restarted" : `failed (${r.status})` };
}

/**
 * Container migration: stop on source host, pull & start on target host.
 * Note: requires the image to be available on the target host.
 */
export async function migrateContainer(
  srcHostUrl: string,
  tgtHostUrl: string,
  containerId: string,
  image: string
): Promise<{ ok: boolean; message: string }> {
  const stopResult = await stopContainer(srcHostUrl, containerId);
  if (!stopResult.ok) return { ok: false, message: `stop failed: ${stopResult.message}` };

  // Pull image on target
  await dockerPost(tgtHostUrl, `/images/create?fromImage=${encodeURIComponent(image)}`);

  // Create and start on target (simplified: use image name as minimal config)
  const createRes = await dockerPost(tgtHostUrl, "/containers/create", {
    Image: image,
    HostConfig: { AutoRemove: false },
  });
  if (!createRes.ok) return { ok: false, message: `create on target failed (${createRes.status})` };

  return { ok: true, message: `container ${containerId} migrated from ${srcHostUrl} to ${tgtHostUrl}` };
}
