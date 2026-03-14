/**
 * GhostDockerController — secure Docker container lifecycle manager.
 *
 * All container operations use `execFile` (never `exec`) so Docker
 * arguments are never interpreted by a shell, eliminating command-injection
 * risk (OWASP A03).  Container names are also validated against a strict
 * regex before any operation is performed.
 *
 * Usage:
 *   const docker = new GhostDockerController({
 *     allowlist: ["ghost-vault", "ghost-ai", "ghost-bridge"],
 *   });
 *
 *   await docker.restart("ghost-bridge");
 *   const running = await docker.isRunning("ghost-ai");
 *   const list    = await docker.list();
 */

import { execFile as _execFile } from "node:child_process";
import { promisify } from "node:util";

const execFile = promisify(_execFile);

// ── Validation ─────────────────────────────────────────────────────────────────

/**
 * Docker container names: start with [a-zA-Z0-9_], then [a-zA-Z0-9_.-]
 * (no slashes, no spaces, max 128 chars).
 * Ref: https://docs.docker.com/engine/reference/commandline/run/
 */
const CONTAINER_NAME_RE = /^[a-zA-Z0-9_][a-zA-Z0-9_./-]{0,127}$/;

function assertContainerName(name: string): void {
  if (!CONTAINER_NAME_RE.test(name)) {
    throw new TypeError(
      `GhostDockerController: invalid container name "${name}". ` +
      `Names must match /^[a-zA-Z0-9_][a-zA-Z0-9_.\\/-]{0,127}$/`
    );
  }
}

// ── Configuration ──────────────────────────────────────────────────────────────

export interface GhostDockerControllerConfig {
  /**
   * Optional allowlist of container names that may be controlled.
   * If omitted, all syntactically valid container names are accepted.
   * Recommended in production to prevent controlling unintended containers.
   */
  allowlist?: string[];

  /** Command timeout in milliseconds. Default: 10 000 ms. */
  timeoutMs?: number;
}

// ── Types ──────────────────────────────────────────────────────────────────────

export interface ContainerInfo {
  id:     string;
  name:   string;
  status: string;
  image:  string;
}

// ── GhostDockerController ──────────────────────────────────────────────────────

export class GhostDockerController {
  private readonly _allowlist: Set<string> | null;
  private readonly _timeoutMs: number;

  constructor(config: GhostDockerControllerConfig = {}) {
    this._allowlist = config.allowlist
      ? new Set(config.allowlist.map(n => { assertContainerName(n); return n; }))
      : null;
    this._timeoutMs = config.timeoutMs ?? 10_000;
  }

  // ── Container operations ──────────────────────────────────────────────────────

  /** Restart a running container. */
  async restart(name: string): Promise<void> {
    this._validate(name);
    await this._docker(["restart", name]);
  }

  /** Start a stopped container. */
  async start(name: string): Promise<void> {
    this._validate(name);
    await this._docker(["start", name]);
  }

  /** Stop a running container gracefully. */
  async stop(name: string, timeoutSec = 10): Promise<void> {
    this._validate(name);
    // --time must be a non-negative integer — enforce that here.
    const t = Math.max(0, Math.floor(timeoutSec));
    await this._docker(["stop", "--time", String(t), name]);
  }

  /** Kill a container immediately. */
  async kill(name: string, signal: "SIGTERM" | "SIGKILL" | "SIGHUP" = "SIGTERM"): Promise<void> {
    this._validate(name);
    // Signal values are restricted to a typed union — no injection possible.
    await this._docker(["kill", "--signal", signal, name]);
  }

  /** Inspect a container. Returns `null` if the container does not exist. */
  async inspect(name: string): Promise<Record<string, unknown> | null> {
    this._validate(name);
    try {
      const { stdout } = await this._docker(["inspect", name]);
      const arr = JSON.parse(stdout) as unknown[];
      return (arr[0] ?? null) as Record<string, unknown> | null;
    } catch {
      return null;
    }
  }

  /** Return true if the named container is currently running. */
  async isRunning(name: string): Promise<boolean> {
    this._validate(name);
    try {
      const { stdout } = await this._docker([
        "inspect", "--format", "{{.State.Running}}", name,
      ]);
      return stdout.trim() === "true";
    } catch {
      return false;
    }
  }

  /**
   * List all containers.  If an allowlist is configured only allowlisted
   * containers are returned.
   */
  async list(): Promise<ContainerInfo[]> {
    const format = "{{.ID}}\t{{.Names}}\t{{.Status}}\t{{.Image}}";
    const { stdout } = await this._docker(["ps", "--all", "--format", format]);

    const rows: ContainerInfo[] = [];
    for (const line of stdout.split("\n").filter(Boolean)) {
      const [id = "", name = "", status = "", image = ""] = line.split("\t");
      const cleaned = name.replace(/^\//, "");
      if (!this._allowlist || this._allowlist.has(cleaned)) {
        rows.push({ id: id.trim(), name: cleaned, status: status.trim(), image: image.trim() });
      }
    }
    return rows;
  }

  // ── Internals ─────────────────────────────────────────────────────────────────

  private _validate(name: string): void {
    assertContainerName(name);
    if (this._allowlist && !this._allowlist.has(name)) {
      throw new Error(
        `GhostDockerController: container "${name}" is not in the allowlist.`
      );
    }
  }

  /**
   * Run a `docker` sub-command with the given argument list.
   * Uses `execFile` so arguments are never shell-interpreted.
   */
  private async _docker(args: string[]): Promise<{ stdout: string; stderr: string }> {
    return execFile("docker", args, { timeout: this._timeoutMs });
  }
}
