/**
 * Docker Controller
 *
 * Monitors Docker containers and restarts unhealthy ones.
 *
 * Security:
 * - Uses execFile() with argument arrays — NEVER shell string interpolation.
 * - Container names from Docker output are validated against SAFE_NAME_RE
 *   before being passed as restart/stop arguments.
 * - Only containers in the managed allowlist are touched automatically.
 * - Shell option is explicitly false (default); no shell expansion possible.
 */

import { execFile } from "child_process";
import { promisify } from "util";
import type { IController } from "../brain/supervisor_core.js";

const execFileAsync = promisify(execFile);

// ---------------------------------------------------------------------------
// Safety
// ---------------------------------------------------------------------------

/** Docker container names: alphanumeric, hyphens, underscores. */
const SAFE_NAME_RE = /^[a-zA-Z0-9][a-zA-Z0-9_.\-]{0,127}$/;

function assertSafeName(name: string): void {
  if (!SAFE_NAME_RE.test(name)) {
    throw new Error(`Unsafe container name rejected: ${JSON.stringify(name)}`);
  }
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ContainerHealth = "healthy" | "unhealthy" | "starting" | "none" | "exited";

export interface ContainerInfo {
  id:     string;
  name:   string;
  status: string;
  health: ContainerHealth;
}

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const DOCKER_BIN = process.env["DOCKER_BIN"] ?? "/usr/bin/docker";

/**
 * Comma-separated allowlist of container names the supervisor may restart.
 * An empty list means no automatic restarts (safe default).
 */
const CONTAINER_ALLOWLIST: ReadonlySet<string> = new Set(
  (process.env["CONTAINER_ALLOWLIST"] ?? "").split(",").map(s => s.trim()).filter(Boolean)
);

// ---------------------------------------------------------------------------
// DockerController
// ---------------------------------------------------------------------------

export class DockerController implements IController {
  readonly name = "DockerController";

  private lastScan: ContainerInfo[] = [];

  async check(): Promise<void> {
    let containers: ContainerInfo[];
    try {
      containers = await this.listContainers();
    } catch (err) {
      console.warn(`[DockerController] docker unavailable: ${err}`);
      return;
    }

    this.lastScan = containers;

    for (const c of containers) {
      if (c.health === "unhealthy") {
        if (!CONTAINER_ALLOWLIST.has(c.name)) {
          console.log(`[DockerController] "${c.name}" unhealthy — not in allowlist, skipping.`);
          continue;
        }
        console.log(`[DockerController] Restarting unhealthy container: ${c.name}`);
        try {
          await this.restartContainer(c.name);
        } catch (err) {
          console.error(`[DockerController] Failed to restart "${c.name}":`, err);
        }
      }
    }
  }

  getLastScan(): ContainerInfo[] {
    return [...this.lastScan];
  }

  getUnhealthy(): string[] {
    return this.lastScan.filter(c => c.health === "unhealthy").map(c => c.name);
  }

  getExited(): string[] {
    return this.lastScan.filter(c => c.health === "exited").map(c => c.name);
  }

  // ---------------------------------------------------------------------------
  // Public actions (safe — execFile with arg arrays only)
  // ---------------------------------------------------------------------------

  /** List all containers via docker ps -a. Parses tab-separated output. */
  async listContainers(): Promise<ContainerInfo[]> {
    // Format: ID \t Name \t Status \t Health
    const { stdout } = await execFileAsync(
      DOCKER_BIN,
      [
        "ps", "-a",
        "--format", "{{.ID}}\t{{.Names}}\t{{.Status}}\t{{.Health}}",
      ],
      { timeout: 15_000 }
    );
    return this.parse(stdout);
  }

  /** Restart a container by name. Name is validated before use. */
  async restartContainer(name: string): Promise<void> {
    assertSafeName(name);
    await execFileAsync(DOCKER_BIN, ["restart", name], { timeout: 60_000 });
  }

  /** Stop a container by name. */
  async stopContainer(name: string): Promise<void> {
    assertSafeName(name);
    await execFileAsync(DOCKER_BIN, ["stop", name], { timeout: 30_000 });
  }

  /** Pull a new image. Tag must match safe characters only. */
  async pullImage(image: string): Promise<void> {
    // Allow registry paths with colon for tag, slash for namespacing.
    if (!/^[a-zA-Z0-9][a-zA-Z0-9_.\/:\-]{0,255}$/.test(image)) {
      throw new Error(`Unsafe image name rejected: ${JSON.stringify(image)}`);
    }
    await execFileAsync(DOCKER_BIN, ["pull", image], { timeout: 120_000 });
  }

  /** Start a stopped container by name. */
  async startContainer(name: string): Promise<void> {
    assertSafeName(name);
    await execFileAsync(DOCKER_BIN, ["start", name], { timeout: 30_000 });
  }

  // ---------------------------------------------------------------------------
  // Parse
  // ---------------------------------------------------------------------------

  private parse(output: string): ContainerInfo[] {
    const results: ContainerInfo[] = [];
    for (const line of output.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed) continue;

      const parts = trimmed.split("\t");
      const id     = parts[0]?.trim() ?? "";
      const name   = parts[1]?.trim() ?? "";
      const status = parts[2]?.trim() ?? "";
      const health = parts[3]?.trim().toLowerCase() ?? "";

      // Skip containers with malformed names.
      if (!id || !name || !SAFE_NAME_RE.test(name)) continue;

      let healthEnum: ContainerHealth = "none";
      if (health.includes("healthy") && !health.includes("unhealthy")) healthEnum = "healthy";
      else if (health.includes("unhealthy")) healthEnum = "unhealthy";
      else if (health.includes("starting"))  healthEnum = "starting";
      else if (status.toLowerCase().startsWith("exited")) healthEnum = "exited";

      results.push({ id, name, status, health: healthEnum });
    }
    return results;
  }
}
