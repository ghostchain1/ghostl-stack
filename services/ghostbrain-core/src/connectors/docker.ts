/**
 * GhostBrain Core — Docker Connector
 *
 * Interrogates the Docker daemon socket for container health signals.
 * GhostBrain READS state here; it does not directly apply mutations.
 * All mutations are dispatched to bounded executors via NATS task tokens.
 */

import { logger } from "../logger.js";

const DOCKER_SOCKET = process.env["DOCKER_SOCKET"] ?? "/var/run/docker.sock";

interface DockerContainer {
  Id: string;
  Names: string[];
  Image: string;
  State: string;
  Status: string;
  Labels: Record<string, string>;
}

interface DockerInspect {
  Id: string;
  Name: string;
  State: {
    Status: string;
    Running: boolean;
    Paused: boolean;
    Restarting: boolean;
    OOMKilled: boolean;
    ExitCode: number;
    FinishedAt: string;
  };
  Config: {
    Image: string;
    Labels: Record<string, string>;
  };
  NetworkSettings: {
    Ports: Record<string, unknown>;
  };
}

async function dockerGet<T>(path: string): Promise<T | null> {
  try {
    const res = await fetch(`http://localhost${path}`, {
      // @ts-expect-error — Node 22 supports unix sockets in fetch via UnixSocket agent
      socketPath: DOCKER_SOCKET,
      signal: AbortSignal.timeout(8_000),
    });
    if (!res.ok) {
      logger.warn("Docker API non-OK", { path, status: res.status });
      return null;
    }
    return await res.json() as T;
  } catch (err) {
    logger.error("Docker API error", { path, err: String(err) });
    return null;
  }
}

export async function listContainers(): Promise<DockerContainer[]> {
  const containers = await dockerGet<DockerContainer[]>("/containers/json?all=true");
  return containers ?? [];
}

export async function inspectContainer(id: string): Promise<DockerInspect | null> {
  return dockerGet<DockerInspect>(`/containers/${id}/json`);
}

export async function getContainerHealth(): Promise<
  Array<{ name: string; state: string; running: boolean; restarting: boolean; oomKilled: boolean }>
> {
  const containers = await listContainers();
  const health = [];

  for (const c of containers) {
    const name = c.Names[0] ?? c.Id;
    health.push({
      name: name.replace(/^\//, ""),
      state: c.State,
      running: c.State === "running",
      restarting: c.State === "restarting",
      oomKilled: false,  // populate from inspect if needed
    });
  }

  return health;
}

/**
 * Detect unhealthy / crash-looping containers.
 */
export async function detectUnhealthyContainers(): Promise<
  Array<{ name: string; issue: string }>
> {
  const containers = await listContainers();
  const unhealthy: Array<{ name: string; issue: string }> = [];

  for (const c of containers) {
    const name = (c.Names[0] ?? c.Id).replace(/^\//, "");
    if (c.State === "exited" || c.State === "dead") {
      unhealthy.push({ name, issue: `container ${c.State}` });
    } else if (c.State === "restarting") {
      unhealthy.push({ name, issue: "crash-looping (restarting)" });
    }
  }

  return unhealthy;
}
