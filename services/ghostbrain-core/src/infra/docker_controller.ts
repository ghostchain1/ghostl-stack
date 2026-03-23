/**
 * GhostBrain Core — Docker Controller
 *
 * Collects container resource state by talking to the Docker Engine API
 * via its Unix socket (/var/run/docker.sock).
 * Falls back gracefully when the socket is unavailable.
 *
 * Called periodically by the decision loop to feed InfrastructureMemory.
 */

import http from "node:http";
import { request } from "undici";
import { recordInfraSnapshot } from "../memory/infrastructure_memory.js";

const DOCKER_SOCKET = process.env.DOCKER_SOCKET ?? "unix:///var/run/docker.sock";
const DOCKER_HTTP   = process.env.DOCKER_HTTP   ?? "";   // optional TCP override

function dockerOrigin(): string {
  if (DOCKER_HTTP) return DOCKER_HTTP;
  // undici unix socket via IPC
  return "http://localhost";
}

function dockerPath(): string | undefined {
  if (DOCKER_HTTP) return undefined;
  return DOCKER_SOCKET.replace(/^unix:\/\//, "");
}

async function dockerGet<T>(path: string): Promise<T | null> {
  const socketPath = dockerPath();
  if (socketPath) {
    try {
      const body = await new Promise<string>((resolve, reject) => {
        const req = http.request(
          {
            socketPath,
            path,
            method: "GET",
            headers: { Host: "docker" },
            timeout: 5_000,
          },
          (res) => {
            if ((res.statusCode ?? 500) !== 200) {
              reject(new Error(`docker_http_status_${res.statusCode ?? 500}`));
              res.resume();
              return;
            }

            let chunks = "";
            res.setEncoding("utf8");
            res.on("data", (chunk) => { chunks += chunk; });
            res.on("end", () => resolve(chunks));
          },
        );

        req.on("timeout", () => req.destroy(new Error("docker_socket_timeout")));
        req.on("error", reject);
        req.end();
      });

      return JSON.parse(body) as T;
    } catch {
      return null;
    }
  }

  try {
    const origin     = dockerOrigin();
    const opts = { path, method: "GET" as const, headers: { Host: "docker" }, bodyTimeout: 5_000, connectTimeout: 3_000 };

    const res  = await request(origin, opts as Parameters<typeof request>[1]);
    if (res.statusCode !== 200) return null;
    const body = await res.body.text();
    return JSON.parse(body) as T;
  } catch {
    return null;
  }
}

interface DockerContainer {
  Id:     string;
  Names:  string[];
  State:  string;
  Status: string;
}

interface DockerStats {
  name:               string;
  restart_count?:     number;
  memory_stats?: {
    usage?:  number;
    limit?:  number;
  };
  cpu_stats?: {
    cpu_usage?:    { total_usage?: number };
    system_cpu_usage?: number;
    online_cpus?:  number;
  };
  precpu_stats?: {
    cpu_usage?:    { total_usage?: number };
    system_cpu_usage?: number;
  };
}

/**
 * Fetch all container states + stats and push snapshots into InfraMemory.
 * Returns a summary of containers processed.
 */
export async function collectDockerSnapshots(): Promise<{ processed: number; errors: number }> {
  const containers = await dockerGet<DockerContainer[]>("/containers/json?all=false");
  if (!containers) return { processed: 0, errors: 1 };

  let processed = 0;
  let errors    = 0;

  for (const c of containers) {
    const name = (c.Names[0] ?? c.Id).replace(/^\//, "");
    const stats = await dockerGet<DockerStats>(`/containers/${c.Id}/stats?stream=false`);
    if (!stats) { errors++; continue; }

    // CPU %
    const cpuDelta  = (stats.cpu_stats?.cpu_usage?.total_usage  ?? 0) - (stats.precpu_stats?.cpu_usage?.total_usage  ?? 0);
    const sysDelta  = (stats.cpu_stats?.system_cpu_usage          ?? 0) - (stats.precpu_stats?.system_cpu_usage          ?? 0);
    const cpuCount  = stats.cpu_stats?.online_cpus ?? 1;
    const cpuPct    = sysDelta > 0 ? (cpuDelta / sysDelta) * cpuCount * 100 : 0;

    // Memory %
    const memUsage  = stats.memory_stats?.usage ?? 0;
    const memLimit  = stats.memory_stats?.limit ?? 1;
    const memPct    = (memUsage / memLimit) * 100;

    recordInfraSnapshot({
      ts:         Date.now(),
      layer:      "container",
      resourceId: name,
      cpuPct:     Math.min(cpuPct, 100),
      memPct:     Math.min(memPct, 100),
      diskIoPct:  0,    // not available from stats API without blkio_stats parsing
      netMbps:    0,
      restarts:   stats.restart_count ?? 0,
      healthy:    c.State === "running",
      meta:       { dockerId: c.Id, state: c.State, status: c.Status },
    });
    processed++;
  }

  return { processed, errors };
}

/** Single-shot health check for one container by name. */
export async function containerHealth(name: string): Promise<{ healthy: boolean; cpuPct: number; memPct: number } | null> {
  const containers = await dockerGet<DockerContainer[]>(`/containers/json?filters=${encodeURIComponent(JSON.stringify({ name: [name] }))}`);
  if (!containers?.length) return null;
  const c = containers[0];
  const stats = await dockerGet<DockerStats>(`/containers/${c.Id}/stats?stream=false`);
  if (!stats) return null;
  const memUsage = stats.memory_stats?.usage ?? 0;
  const memLimit = stats.memory_stats?.limit ?? 1;
  return {
    healthy: c.State === "running",
    cpuPct:  0,   // simplified — full calc requires delta; not needed for single-shot
    memPct:  (memUsage / memLimit) * 100,
  };
}
