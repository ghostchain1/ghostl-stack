/**
 * Container Analyzer
 *
 * Queries the Docker daemon via `docker ps` and `docker inspect` to enumerate
 * running containers, their health status, restart counts, and images.
 *
 * SECURITY: All docker calls use execFile with a fixed argument array.
 * No user-supplied data is interpolated into shell commands.
 */
import { execFile as execFileCb } from "node:child_process";
import { promisify }              from "node:util";
import type { ContainerInfo, ContainerHealth } from "../types.js";
import { isAllowedImage, isAllowedContainer } from "../policies/security-policy.js";
import { SAFE_NAME_RE } from "../types.js";

const execFile = promisify(execFileCb);

// ---------------------------------------------------------------------------
// Docker JSON output shapes
// ---------------------------------------------------------------------------

interface DockerPsEntry {
  ID:       string;
  Names:    string;
  Image:    string;
  Status:   string;
  State:    string;
  Health?:  string;
}

interface DockerInspectEntry {
  Name:  string;
  State: {
    Running:        boolean;
    Dead:           boolean;
    ExitCode:       number;
    Status:         string;
    Health?: {
      Status: string;
    };
    RestartCount?: number;
  };
  RestartCount?: number;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function parseHealth(raw?: string): ContainerHealth {
  switch (raw?.toLowerCase()) {
    case "healthy":   return "healthy";
    case "unhealthy": return "unhealthy";
    case "starting":  return "starting";
    case "none":      return "none";
    default:          return "unknown";
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export async function analyzeContainers(): Promise<ContainerInfo[]> {
  let psOutput = "";

  try {
    const { stdout } = await execFile(
      "docker",
      ["ps", "--all", "--format", "{{json .}}", "--no-trunc"],
      { timeout: 10_000 }
    );
    psOutput = stdout;
  } catch {
    return []; // Docker unavailable
  }

  const entries: ContainerInfo[] = [];

  for (const line of psOutput.trim().split("\n")) {
    if (!line.trim()) continue;

    let row: DockerPsEntry;
    try {
      row = JSON.parse(line) as DockerPsEntry;
    } catch {
      continue;
    }

    const name  = row.Names.replace(/^\//, ""); // docker prefixes names with /
    const image = row.Image;

    // Security: skip containers whose image is not ghost-prefixed
    if (!isAllowedImage(image)) continue;
    // Security: validate container name before any further use
    if (!isAllowedContainer(name) || !SAFE_NAME_RE.test(name)) continue;

    let restartCount = 0;
    let health: ContainerHealth = parseHealth(row.Health);

    // Inspect for richer data (RestartCount, health detail)
    try {
      const { stdout: inspOut } = await execFile(
        "docker",
        ["inspect", "--format", "{{json .}}", row.ID],
        { timeout: 5_000 }
      );
      const inspData = JSON.parse(inspOut) as DockerInspectEntry | DockerInspectEntry[];
      const insp = Array.isArray(inspData) ? inspData[0] : inspData;
      if (insp) {
        restartCount = insp.RestartCount ?? insp.State.RestartCount ?? 0;
        if (insp.State.Health) {
          health = parseHealth(insp.State.Health.Status);
        }
      }
    } catch { /* inspect optional — use ps data */ }

    entries.push({
      id:           row.ID.slice(0, 12),
      name,
      image,
      status:       row.Status,
      health,
      running:      row.State.toLowerCase() === "running",
      restartCount,
    });
  }

  return entries;
}
