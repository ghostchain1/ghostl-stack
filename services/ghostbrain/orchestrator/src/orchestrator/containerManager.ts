/**
 * orchestrator/containerManager.ts — Docker container lifecycle via HTTP API.
 *
 * SECURITY INVARIANTS:
 *   1. Docker API accessed via HTTP socket (undici), never via exec() / shell
 *   2. All container names are validated against CONTAINER_NAME_RE before use
 *   3. hostUrl is sourced from config only, never from user/external input
 *   4. AbortController timeout on every request
 *   5. Read-only Docker socket mount recommended (write ops gated behind HMAC)
 */

import { request } from "undici";
import { DOCKER_SOCKET, THRESHOLDS } from "../config.js";
import type { ContainerInfo, InfraReport } from "../types.js";

// ── Security: container name allowlist ───────────────────────────────────────

const CONTAINER_NAME_RE = /^[a-z0-9][a-z0-9_\-.]{0,127}$/i;

function assertValidContainerName(name: string): void {
  if (!CONTAINER_NAME_RE.test(name)) {
    throw new Error(`Invalid container name: "${name}"`);
  }
}

// ── Docker socket helper ──────────────────────────────────────────────────────

/**
 * Resolves the base URL for undici from the socket path/TCP address.
 * unix:///var/run/docker.sock  →  { socketPath: "/var/run/docker.sock", origin: "http://localhost" }
 * http://dockerhost:2375       →  standard HTTP
 */
function resolveDockerClient(socketOrUrl: string): {
  origin: string;
  socketPath?: string;
} {
  if (socketOrUrl.startsWith("unix://")) {
    return {
      origin: "http://localhost",
      socketPath: socketOrUrl.replace("unix://", ""),
    };
  }
  return { origin: socketOrUrl };
}

interface DockerRequestOpts {
  method: "GET" | "POST" | "DELETE";
  path: string;
  body?: unknown;
}

async function dockerRequest(
  opts: DockerRequestOpts,
): Promise<{ ok: boolean; status: number; body: unknown }> {
  const { origin, socketPath } = resolveDockerClient(DOCKER_SOCKET);
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), THRESHOLDS.rpcTimeoutMs);

  try {
    const { statusCode, body } = await request(`${origin}${opts.path}`, {
      method: opts.method,
      headers: opts.body ? { "Content-Type": "application/json" } : undefined,
      body: opts.body ? JSON.stringify(opts.body) : undefined,
      // @ts-expect-error undici accepts socketPath for unix sockets
      socketPath,
      signal: ac.signal,
    });

    let parsed: unknown = null;
    try {
      const chunks: Buffer[] = [];
      for await (const chunk of body) {
        chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
      }
      parsed = JSON.parse(Buffer.concat(chunks).toString());
    } catch {
      // non-JSON response (e.g. 204 No Content)
    }

    return { ok: statusCode >= 200 && statusCode < 300, status: statusCode, body: parsed };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, status: 0, body: { error: message } };
  } finally {
    clearTimeout(timer);
  }
}

// ── Docker API response shapes ────────────────────────────────────────────────

interface RawContainer {
  Id?:          string;
  Names?:       string[];
  Image?:       string;
  Status?:      string;
  State?:       string;
  RestartCount?: number;
}

// ── Exported functions ────────────────────────────────────────────────────────

/**
 * List all containers (running + stopped).
 */
export async function listContainers(): Promise<ContainerInfo[]> {
  const { ok, body } = await dockerRequest({ method: "GET", path: "/containers/json?all=true" });
  if (!ok || !Array.isArray(body)) return [];

  return (body as RawContainer[]).map((c): ContainerInfo => {
    const rawName = (c.Names?.[0] ?? "").replace(/^\//, "");
    return {
      id:           c.Id?.slice(0, 12) ?? "unknown",
      name:         rawName,
      image:        c.Image ?? "unknown",
      status:       c.Status ?? "unknown",
      state:        c.State ?? "unknown",
      restartCount: c.RestartCount ?? 0,
      hostUrl:      DOCKER_SOCKET,
    };
  });
}

/**
 * Build an infrastructure report from the current container list.
 */
export async function buildInfraReport(): Promise<InfraReport> {
  const containers = await listContainers();
  const totalUp   = containers.filter((c) => c.state === "running").length;
  const totalDown = containers.length - totalUp;
  return { containers, totalUp, totalDown, scannedAt: Date.now() };
}

/**
 * Restart a named container via the Docker API.
 * Name is validated before any API call.
 */
export async function restartContainer(name: string): Promise<{ ok: boolean; message: string }> {
  assertValidContainerName(name);

  const path = `/containers/${encodeURIComponent(name)}/restart`;
  const { ok, status } = await dockerRequest({ method: "POST", path });
  return {
    ok,
    message: ok ? `Container "${name}" restarted` : `Restart failed (HTTP ${status})`,
  };
}

/**
 * Stop a named container (signals SIGTERM then waits 10 s).
 */
export async function stopContainer(name: string): Promise<{ ok: boolean; message: string }> {
  assertValidContainerName(name);

  const path = `/containers/${encodeURIComponent(name)}/stop?t=10`;
  const { ok, status } = await dockerRequest({ method: "POST", path });
  return {
    ok,
    message: ok ? `Container "${name}" stopped` : `Stop failed (HTTP ${status})`,
  };
}

/**
 * Inspect a single container by name.  Returns null if not found.
 */
export async function inspectContainer(name: string): Promise<unknown | null> {
  assertValidContainerName(name);

  const { ok, body } = await dockerRequest({
    method: "GET",
    path: `/containers/${encodeURIComponent(name)}/json`,
  });
  return ok ? body : null;
}
