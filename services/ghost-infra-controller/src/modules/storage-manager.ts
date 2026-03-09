/**
 * Storage Manager
 *
 * Evaluates disk usage from SystemState.disks and raises storage-expand
 * proposals when any monitored mount falls below the minimum free threshold.
 *
 * Storage expansion (adding disks, extending LVM, adding cloud volumes)
 * always requires human ratification — it is a destructive/irreversible
 * infrastructure change that cannot be safely automated.
 */
import type { SystemState, InfraAction } from "../types.js";
import { MIN_FREE_DISK_BYTES }           from "../policies/security-policy.js";

function formatGiB(bytes: number): string {
  return (bytes / (1024 ** 3)).toFixed(1) + " GiB";
}

export async function monitorStorage(state: SystemState): Promise<InfraAction[]> {
  const actions: InfraAction[] = [];
  const now = Date.now();

  for (const disk of state.disks) {
    if (disk.freeBytes >= MIN_FREE_DISK_BYTES) continue;

    const risk = disk.freeBytes < MIN_FREE_DISK_BYTES / 4 ? "critical" : "high";

    actions.push({
      id:          crypto.randomUUID(),
      type:        "storage_expand",
      target:      disk.mountpoint,
      description: `Disk "${disk.mountpoint}" free space ${formatGiB(disk.freeBytes)} below threshold ${formatGiB(MIN_FREE_DISK_BYTES)} (${disk.usedPct}% used). Propose storage expansion.`,
      params: {
        mountpoint:    disk.mountpoint,
        totalBytes:    disk.totalBytes,
        usedBytes:     disk.usedBytes,
        freeBytes:     disk.freeBytes,
        usedPct:       disk.usedPct,
        thresholdBytes: MIN_FREE_DISK_BYTES,
      },
      timestamp:   now,
      risk,
      autoExecute: false, // storage expansion always requires human approval
    });
  }

  return actions;
}
