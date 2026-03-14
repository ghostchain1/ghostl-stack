/**
 * GhostBrain Agent — Resource Balancer
 *
 * Executes local infrastructure actions in response to cluster commands.
 * All actions are idempotent and bounded — never destructive without
 * explicit `force` flag (which requires cluster consensus).
 */

import { request } from "undici";

export type ActionType =
  | "restart_container"
  | "scale_container_cpu"
  | "scale_container_mem"
  | "throttle_container"
  | "noop";

export interface BalancerAction {
  type: ActionType;
  targetId: string;          // container name or ID
  params?: Record<string, number | string | boolean>;
  force?: boolean;
}

export interface BalancerResult {
  success: boolean;
  action: ActionType;
  targetId: string;
  message: string;
  executedAt: number;
}

const DOCKER_SOCKET = process.env.DOCKER_SOCKET ?? "/var/run/docker.sock";
const SOCKET_URL    = `unix://${DOCKER_SOCKET}`;

async function dockerPost(path: string, body?: unknown): Promise<{ ok: boolean; status: number }> {
  try {
    const res = await request(`${SOCKET_URL}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: body !== undefined ? JSON.stringify(body) : undefined,
      bodyTimeout: 10_000,
    });
    // Docker returns 204 for success on many endpoints
    return { ok: res.statusCode < 300, status: res.statusCode };
  } catch (e) {
    return { ok: false, status: 0 };
  }
}

async function restartContainer(id: string): Promise<BalancerResult> {
  const r = await dockerPost(`/containers/${id}/restart?t=10`);
  return {
    success: r.ok,
    action: "restart_container",
    targetId: id,
    message: r.ok ? "container restarted" : `restart failed (HTTP ${r.status})`,
    executedAt: Date.now(),
  };
}

async function scaleContainerCpu(id: string, nanoCpus: number): Promise<BalancerResult> {
  const r = await dockerPost(`/containers/${id}/update`, { NanoCpus: nanoCpus });
  return {
    success: r.ok,
    action: "scale_container_cpu",
    targetId: id,
    message: r.ok ? `CPU limit set to ${nanoCpus} nano-cpus` : `scale failed (HTTP ${r.status})`,
    executedAt: Date.now(),
  };
}

async function scaleContainerMem(id: string, memLimitBytes: number): Promise<BalancerResult> {
  const r = await dockerPost(`/containers/${id}/update`, { Memory: memLimitBytes, MemorySwap: memLimitBytes * 2 });
  return {
    success: r.ok,
    action: "scale_container_mem",
    targetId: id,
    message: r.ok ? `Memory limit set to ${Math.round(memLimitBytes / 1024 / 1024)} MB` : `scale failed (HTTP ${r.status})`,
    executedAt: Date.now(),
  };
}

async function throttleContainer(id: string, cpuShares: number): Promise<BalancerResult> {
  // CpuShares: 512 = half weight, 1024 = default, 2048 = double
  const r = await dockerPost(`/containers/${id}/update`, { CpuShares: cpuShares });
  return {
    success: r.ok,
    action: "throttle_container",
    targetId: id,
    message: r.ok ? `CPU shares set to ${cpuShares}` : `throttle failed (HTTP ${r.status})`,
    executedAt: Date.now(),
  };
}

export async function executeLocalAction(action: BalancerAction): Promise<BalancerResult> {
  try {
    switch (action.type) {
      case "restart_container":
        return await restartContainer(action.targetId);

      case "scale_container_cpu": {
        const nanoCpus = typeof action.params?.nanoCpus === "number"
          ? action.params.nanoCpus
          : 1_000_000_000; // default 1 vCPU
        return await scaleContainerCpu(action.targetId, nanoCpus);
      }

      case "scale_container_mem": {
        const limitMb = typeof action.params?.limitMb === "number"
          ? action.params.limitMb
          : 512;
        return await scaleContainerMem(action.targetId, limitMb * 1024 * 1024);
      }

      case "throttle_container": {
        const shares = typeof action.params?.cpuShares === "number"
          ? action.params.cpuShares
          : 512;
        return await throttleContainer(action.targetId, shares);
      }

      case "noop":
        return { success: true, action: "noop", targetId: action.targetId, message: "no-op", executedAt: Date.now() };
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { success: false, action: action.type, targetId: action.targetId, message: msg, executedAt: Date.now() };
  }
}
