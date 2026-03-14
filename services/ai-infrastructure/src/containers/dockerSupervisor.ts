/**
 * dockerSupervisor.ts — Docker container health monitor & auto-restarter
 *
 * Connects to the Docker daemon via the Unix socket (or DOCKER_HOST env var).
 * Lists all containers every 60 s and restarts any that are not running.
 * Requires /var/run/docker.sock to be mounted when running inside a container.
 *
 * When AIE_DOCKER_REPAIR=false (default) the supervisor logs intended actions
 * without executing them (dry-run mode). Set to "true" to enable live restarts.
 */

import logger from "../utils/logger";

export interface ContainerRecord {
  id: string;
  name: string;
  image: string;
  status: string;
  running: boolean;
  lastAction?: string;
}

export interface RestartEvent {
  timestamp: string;
  containerId: string;
  containerName: string;
  reason: string;
  dryRun: boolean;
  success: boolean;
  error?: string;
}

const REPAIR_ENABLED = process.env.AIE_DOCKER_REPAIR === "true";
const MAX_EVENT_LOG  = 200;

const restartLog: RestartEvent[] = [];
let lastContainerList: ContainerRecord[] = [];

// ── Docker API helpers (via dockerode loaded at runtime) ──────────────────────

function getDocker() {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const Docker = require("dockerode") as typeof import("dockerode");
    // Respects DOCKER_HOST env or defaults to /var/run/docker.sock
    return new Docker();
  } catch {
    return null;
  }
}

// ── Public API ────────────────────────────────────────────────────────────────

export async function checkContainers(): Promise<ContainerRecord[]> {
  const docker = getDocker();
  if (!docker) {
    logger.warn("[DockerSupervisor] dockerode not available — skipping");
    return [];
  }

  let raw: Awaited<ReturnType<typeof docker.listContainers>>;
  try {
    raw = await docker.listContainers({ all: true });
  } catch (err) {
    logger.error("[DockerSupervisor] Failed to list containers", { err: String(err) });
    return lastContainerList;
  }

  const containers: ContainerRecord[] = raw.map((c) => ({
    id:      c.Id.slice(0, 12),
    name:    (c.Names[0] ?? c.Id).replace(/^\//, ""),
    image:   c.Image,
    status:  c.Status,
    running: c.State === "running",
  }));

  lastContainerList = containers;

  // Identify stopped containers that should be running
  const stopped = containers.filter((c) => !c.running);
  for (const c of stopped) {
    await handleStoppedContainer(docker, c);
  }

  if (stopped.length > 0) {
    logger.info(`[DockerSupervisor] ${stopped.length} stopped container(s) found`, {
      containers: stopped.map((c) => c.name),
    });
  }

  return containers;
}

async function handleStoppedContainer(
  docker: NonNullable<ReturnType<typeof getDocker>>,
  c: ContainerRecord,
): Promise<void> {
  const event: RestartEvent = {
    timestamp:     new Date().toISOString(),
    containerId:   c.id,
    containerName: c.name,
    reason:        `Container state: ${c.status}`,
    dryRun:        !REPAIR_ENABLED,
    success:       false,
  };

  if (!REPAIR_ENABLED) {
    event.success = true; // dry-run always "succeeds"
    logger.info(`[DockerSupervisor] DRY-RUN: would restart ${c.name}`);
    restartLog.unshift(event);
    if (restartLog.length > MAX_EVENT_LOG) restartLog.pop();
    return;
  }

  try {
    const container = docker.getContainer(c.id);
    await container.restart({ t: 10 });
    event.success = true;
    logger.info(`[DockerSupervisor] Restarted container: ${c.name}`);
  } catch (err) {
    event.error = String(err);
    logger.error(`[DockerSupervisor] Failed to restart ${c.name}`, { err: String(err) });
  }

  restartLog.unshift(event);
  if (restartLog.length > MAX_EVENT_LOG) restartLog.pop();
}

export function getRestartLog(): RestartEvent[] {
  return restartLog.slice(0, 50);
}

export function getLastContainerList(): ContainerRecord[] {
  return lastContainerList;
}

export function getContainerSummary() {
  const all     = lastContainerList.length;
  const running = lastContainerList.filter((c) => c.running).length;
  return { total: all, running, stopped: all - running, restartEvents: restartLog.length };
}
