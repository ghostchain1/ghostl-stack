import { ProcessRunner, Logger } from "@ghostchain/devkit";
import { promises as fs } from "node:fs";
import * as path from "node:path";

const log = Logger.create("StorageManager");

export interface VolumeInfo {
  name: string;
  driver: string;
  mountpoint: string;
  labels: Record<string, string>;
}

export interface DiskUsage {
  path: string;
  totalGiB: number;
  usedGiB: number;
  availGiB: number;
  usedPercent: number;
}

/**
 * GhostStorageManager — manages Docker volumes and host-level
 * directories; reports disk utilisation and prunes stale volumes.
 */
export class GhostStorageManager {
  /** List all Docker volumes. */
  async listVolumes(): Promise<VolumeInfo[]> {
    const out = await ProcessRunner.exec("docker", [
      "volume", "ls",
      "--format", "{{.Name}}\t{{.Driver}}\t{{.Mountpoint}}\t{{.Labels}}",
    ]);
    return out
      .trim()
      .split("\n")
      .filter(Boolean)
      .map((line) => {
        const [name, driver, mountpoint, rawLabels] = line.split("\t") as [string, string, string, string];
        const labels: Record<string, string> = {};
        (rawLabels ?? "").split(",").filter(Boolean).forEach((pair) => {
          const eqIdx = pair.indexOf("=");
          if (eqIdx !== -1) labels[pair.slice(0, eqIdx)] = pair.slice(eqIdx + 1);
        });
        return { name, driver, mountpoint, labels };
      });
  }

  /** Create a Docker volume. */
  async createVolume(name: string, driver = "local", labels: Record<string, string> = {}): Promise<void> {
    const args = ["volume", "create", "--driver", driver];
    for (const [k, v] of Object.entries(labels)) {
      args.push("--label", `${k}=${v}`);
    }
    args.push(name);
    await ProcessRunner.exec("docker", args);
    log.info(`Created volume: ${name} (${driver})`);
  }

  /** Remove a Docker volume. */
  async removeVolume(name: string, force = false): Promise<void> {
    const args = ["volume", "rm"];
    if (force) args.push("--force");
    args.push(name);
    await ProcessRunner.exec("docker", args);
    log.info(`Removed volume: ${name}`);
  }

  /** Inspect a single Docker volume. */
  async inspectVolume(name: string): Promise<VolumeInfo | null> {
    try {
      const out = await ProcessRunner.exec("docker", [
        "volume", "inspect", name,
        "--format", "{{.Name}}\t{{.Driver}}\t{{.Mountpoint}}",
      ]);
      const [vname, driver, mountpoint] = out.trim().split("\t") as [string, string, string];
      return { name: vname, driver, mountpoint, labels: {} };
    } catch {
      return null;
    }
  }

  /** Prune unused Docker volumes. */
  async pruneUnused(): Promise<string> {
    const out = await ProcessRunner.exec("docker", ["volume", "prune", "--force"]);
    log.info(`Volume prune: ${out.trim()}`);
    return out.trim();
  }

  // ─── Host-level directory management ─────────────────────────────

  /** Ensure a host directory exists with the given permissions. */
  async ensureDir(dirPath: string, mode = 0o755): Promise<void> {
    await fs.mkdir(dirPath, { recursive: true, mode });
    log.info(`Ensured directory: ${dirPath}`);
  }

  /** Remove a host directory and all contents. */
  async removeDir(dirPath: string): Promise<void> {
    await fs.rm(dirPath, { recursive: true, force: true });
    log.info(`Removed directory: ${dirPath}`);
  }

  // ─── Disk usage ────────────────────────────────────────────────

  /** Get disk usage for one or more paths. */
  async diskUsage(paths: string[] = ["/"]): Promise<DiskUsage[]> {
    const results: DiskUsage[] = [];
    for (const p of paths) {
      try {
        const out = await ProcessRunner.exec("df", ["-BG", "--output=size,used,avail,pcent", p]);
        const lines = out.trim().split("\n").filter(Boolean);
        const data  = lines[lines.length - 1]!.trim().split(/\s+/);
        const total  = parseFloat(data[0] ?? "0");
        const used   = parseFloat(data[1] ?? "0");
        const avail  = parseFloat(data[2] ?? "0");
        const pct    = parseFloat((data[3] ?? "0%").replace("%", ""));
        results.push({ path: p, totalGiB: total, usedGiB: used, availGiB: avail, usedPercent: pct });
      } catch {
        results.push({ path: p, totalGiB: 0, usedGiB: 0, availGiB: 0, usedPercent: 0 });
      }
    }
    return results;
  }

  /** Returns paths where disk usage exceeds the given threshold %. */
  async highUsagePaths(paths: string[], thresholdPct = 85): Promise<DiskUsage[]> {
    const all = await this.diskUsage(paths);
    return all.filter((d) => d.usedPercent >= thresholdPct);
  }
}
