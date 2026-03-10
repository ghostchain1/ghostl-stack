/**
 * GhostBrain Kernel — Docker Manager
 *
 * KernelHandler that executes container-level lifecycle operations.
 * All Docker calls go through the Docker Engine REST API over the Unix
 * socket — never via shell exec / child_process to eliminate command
 * injection risk.
 *
 * The container name supplied in KernelCommand.target has already been
 * validated by SafetyGuard (alphanumeric + safe punctuation, max 128 chars)
 * before this handler is reached.  It is additionally passed through
 * encodeURIComponent before being placed in the API path.
 *
 * Supported actions:
 *   restart  POST /containers/{name}/restart
 *   stop     POST /containers/{name}/stop
 *   start    POST /containers/{name}/start
 *   kill     POST /containers/{name}/kill
 *   pause    POST /containers/{name}/pause
 *   unpause  POST /containers/{name}/unpause
 *
 * Env vars:
 *   DOCKER_SOCKET   unix socket path (default: unix:///var/run/docker.sock)
 *   DOCKER_HTTP     TCP override (e.g. http://localhost:2375)
 */

import { request } from "undici";
import type { KernelCommand, KernelResult, KernelHandler } from "./command_bus.js";
import { log } from "../observability/event_logger.js";

// ── Config ────────────────────────────────────────────────────────────────────

const DOCKER_SOCKET = process.env.DOCKER_SOCKET ?? "unix:///var/run/docker.sock";
const DOCKER_HTTP   = process.env.DOCKER_HTTP   ?? "";

// Fixed suffix per action — no user data is interpolated into these strings.
const ACTION_SUFFIXES: Readonly<Record<string, string>> = {
  restart: "/restart",
  stop:    "/stop",
  start:   "/start",
  kill:    "/kill",
  pause:   "/pause",
  unpause: "/unpause",
};

// ── Docker API helpers ────────────────────────────────────────────────────────

function _socketPath(): string | undefined {
  if (DOCKER_HTTP) return undefined;
  return DOCKER_SOCKET.replace(/^unix:\/\//, "");
}

function _origin(): string {
  return DOCKER_HTTP || "http://localhost";
}

async function dockerPost(
  containerName: string,
  action: string,
  dryRun: boolean,
): Promise<{ ok: boolean; detail: string }> {
  if (dryRun) {
    const suffix = ACTION_SUFFIXES[action] ?? `/${action}`;
    return { ok: true, detail: `dry-run: POST /containers/${containerName}${suffix} skipped` };
  }

  const suffix = ACTION_SUFFIXES[action];
  if (!suffix) return { ok: false, detail: `unknown docker action: "${action}"` };

  // containerName is already validated by SafetyGuard.
  // encodeURIComponent handles any remaining edge-cases (e.g. dots in names).
  const path     = `/containers/${encodeURIComponent(containerName)}${suffix}`;
  const sp       = _socketPath();
  const origin   = _origin();

  try {
    const res = await request(origin, {
      path,
      method:         "POST",
      headers:        { Host: "docker", "Content-Length": "0" },
      bodyTimeout:    15_000,
      connectTimeout: 5_000,
      ...(sp ? { socketPath: sp } : {}),
    } as Parameters<typeof request>[1]);
    await res.body.dump();  // drain (required by undici)
    const ok = res.statusCode >= 200 && res.statusCode < 300;
    if (!ok) log.warn("docker_manager: non_2xx", `${action} ${containerName} → HTTP ${res.statusCode}`);
    return { ok, detail: `HTTP ${res.statusCode}` };
  } catch (err) {
    log.warn("docker_manager: api_error", `${action} ${containerName} → ${String(err)}`);
    return { ok: false, detail: String(err) };
  }
}

// ── Handler ───────────────────────────────────────────────────────────────────

let _commandCount = 0;
let _successCount = 0;

export class DockerManager implements KernelHandler {
  canHandle(cmd: KernelCommand): boolean {
    return cmd.type === "docker";
  }

  async execute(cmd: KernelCommand): Promise<KernelResult> {
    const start = Date.now();
    _commandCount++;

    const container = cmd.target ?? "";
    if (!container) {
      return {
        commandId:  cmd.id!,
        ok:         false,
        detail:     "missing target: container name required",
        executedAt: start,
        durationMs: 0,
        dryRun:     !!cmd.dryRun,
      };
    }

    const { ok, detail } = await dockerPost(container, cmd.action, !!cmd.dryRun);
    if (ok) _successCount++;

    return {
      commandId:  cmd.id!,
      ok,
      detail,
      executedAt: start,
      durationMs: Date.now() - start,
      dryRun:     !!cmd.dryRun,
    };
  }
}

export const dockerManager = new DockerManager();

export function dockerManagerStats(): { commands: number; successes: number } {
  return { commands: _commandCount, successes: _successCount };
}
