/**
 * GhostBrain — Container Allocator
 *
 * Manages container resource allocations: CPU quotas, memory limits,
 * and placement across Docker hosts. Works with load_balancer to
 * select the optimal host for container placement or migration.
 *
 * Conventions:
 *   - CPU expressed in NanoCPUs (1 CPU = 1_000_000_000 nanoCPUs)
 *   - Memory expressed in bytes
 */

import { request }         from "undici";
import { selectBestTarget } from "./load_balancer.js";

const DOCKER_SOCKET = process.env.DOCKER_SOCKET ?? "/var/run/docker.sock";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface ContainerResources {
  hostUrl?:    string;          // unix:// or http:// Docker host
  containerId: string;
  nanoCPUs?:   number;          // CPU quota
  memBytes?:   number;          // memory limit
  memSwapBytes?: number;        // swap limit (usually 2× mem)
}

export interface AllocationResult {
  ok:          boolean;
  containerId: string;
  action:      string;
  detail:      string;
}

export interface ContainerPlacementReq {
  image:     string;
  nameHint?: string;
  nanoCPUs:  number;
  memBytes:  number;
  env?:      string[];
  labels?:   Record<string, string>;
}

// ── Docker helpers ────────────────────────────────────────────────────────────

function dockerBase(hostUrl?: string): string {
  const h = hostUrl ?? DOCKER_SOCKET;
  if (h.startsWith("unix://") || h.startsWith("/")) {
    const sock = h.startsWith("unix://") ? h.slice(7) : h;
    return `unix://${sock}`;
  }
  return h;
}

async function dockerPost(hostUrl: string | undefined, path: string, body?: unknown): Promise<{ statusCode: number; rawBody: unknown }> {
  const base = dockerBase(hostUrl);
  const res  = await request(`${base}${path}`, {
    method:  "POST",
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body:    body ? JSON.stringify(body) : undefined,
    bodyTimeout: 10_000,
  });
  let rawBody: unknown = null;
  try { rawBody = await res.body.json(); } catch { /* ignore */ }
  return { statusCode: res.statusCode, rawBody };
}

// ── Update container resources ────────────────────────────────────────────────

export async function updateContainerResources(cfg: ContainerResources): Promise<AllocationResult> {
  const updateBody: Record<string, number> = {};
  if (cfg.nanoCPUs  !== undefined) updateBody["NanoCPUs"]  = cfg.nanoCPUs;
  if (cfg.memBytes  !== undefined) updateBody["Memory"]     = cfg.memBytes;
  if (cfg.memSwapBytes !== undefined) updateBody["MemorySwap"] = cfg.memSwapBytes;

  if (Object.keys(updateBody).length === 0) {
    return { ok: false, containerId: cfg.containerId, action: "update", detail: "no resource changes specified" };
  }

  try {
    const r = await dockerPost(cfg.hostUrl, `/containers/${cfg.containerId}/update`, updateBody);
    return {
      ok:          r.statusCode === 200,
      containerId: cfg.containerId,
      action:      "update_resources",
      detail:      r.statusCode === 200 ? "resources updated" : `docker error ${r.statusCode}`,
    };
  } catch (e) {
    return { ok: false, containerId: cfg.containerId, action: "update_resources", detail: String(e) };
  }
}

// ── Smart placement ───────────────────────────────────────────────────────────

/**
 * Choose the best Docker host for a new container.
 * Falls back to local socket if no load balancer targets are registered.
 */
export function choosePlacementHost(): string | undefined {
  const best = selectBestTarget("docker_host");
  return best?.target.url ?? undefined;
}

/**
 * Create a container on the best available Docker host.
 * Returns host + container id on success.
 */
export async function createContainer(req: ContainerPlacementReq): Promise<{ ok: boolean; hostUrl?: string; containerId?: string; detail: string }> {
  const hostUrl = choosePlacementHost();
  const name    = req.nameHint ?? `ghostbrain-${Date.now()}`;

  const body = {
    Image:      req.image,
    Env:        req.env ?? [],
    Labels:     req.labels ?? {},
    HostConfig: {
      NanoCPUs:    req.nanoCPUs,
      Memory:      req.memBytes,
      MemorySwap:  req.memBytes * 2,
      RestartPolicy: { Name: "unless-stopped" },
    },
  };

  try {
    const r = await dockerPost(hostUrl, `/containers/create?name=${encodeURIComponent(name)}`, body);
    if (r.statusCode !== 201) return { ok: false, hostUrl, detail: `docker create failed: ${r.statusCode}` };
    const created = r.rawBody as { Id?: string };
    const id = created.Id;
    if (!id) return { ok: false, hostUrl, detail: "no container id in response" };

    // Start it
    await dockerPost(hostUrl, `/containers/${id}/start`);
    return { ok: true, hostUrl, containerId: id, detail: "container created and started" };
  } catch (e) {
    return { ok: false, hostUrl, detail: String(e) };
  }
}
