/**
 * System Analyzer
 *
 * Aggregates CPU, memory, VM list, containers, blockchain nodes, network,
 * and disk metrics into a single SystemState snapshot.
 *
 * VM list is obtained via `virsh list --all` (execFile — no shell injection).
 * Disk info is obtained via `df -B1 <mountpoints>` (execFile).
 */
import * as os                    from "node:os";
import { execFile as execFileCb } from "node:child_process";
import { promisify }              from "node:util";
import type { SystemState, VMInfo, VMState, DiskInfo } from "../types.js";
import { analyzeContainers }   from "./container-analyzer.js";
import { analyzeNodes }        from "./node-analyzer.js";
import { analyzeInfraNetwork } from "./network-analyzer.js";
import { SAFE_NAME_RE }        from "../types.js";

const execFile = promisify(execFileCb);

const MONITORED_MOUNTS: string[] = (process.env.MONITORED_MOUNTS ?? "/")
  .split(",")
  .map(m => m.trim())
  .filter(Boolean);

// ---------------------------------------------------------------------------
// VM list via virsh
// ---------------------------------------------------------------------------

function parseVMState(stateStr: string): VMState {
  const s = stateStr.trim().toLowerCase();
  if (s === "running")  return "running";
  if (s === "shut off") return "stopped";
  if (s === "paused")   return "paused";
  if (s === "crashed")  return "crashed";
  return "unknown";
}

async function getVMList(): Promise<VMInfo[]> {
  try {
    const { stdout } = await execFile(
      "virsh",
      ["list", "--all"],
      { timeout: 8_000 }
    );

    // Output format:
    //  Id   Name                    State
    // ------------------------------------------
    //  1    ghostchain-l1-mainnet   running
    //  -    ghostl2-mainnet         shut off
    const vms: VMInfo[] = [];
    const lines = stdout.split("\n").slice(2); // skip header lines

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;

      const parts = trimmed.split(/\s+/);
      if (parts.length < 3) continue;

      const idStr = parts[0] ?? "-";
      const name  = parts[1] ?? "";
      // State may be multi-word ("shut off") — join remaining parts
      const stateRaw = parts.slice(2).join(" ");

      // Security: skip any VM name that fails the safe-name check
      if (!SAFE_NAME_RE.test(name)) continue;

      vms.push({
        id:    idStr === "-" ? null : idStr,
        name,
        state: parseVMState(stateRaw),
      });
    }

    return vms;
  } catch {
    return []; // virsh unavailable (dev/CI environments)
  }
}

// ---------------------------------------------------------------------------
// Disk usage via df
// ---------------------------------------------------------------------------

async function getDiskInfo(): Promise<DiskInfo[]> {
  const results: DiskInfo[] = [];

  for (const mount of MONITORED_MOUNTS) {
    try {
      const { stdout } = await execFile(
        "df",
        ["-B1", "--output=size,used,avail,pcent,target", mount],
        { timeout: 5_000 }
      );

      // Skip header line; parse: size used avail pcent target
      const line = stdout.trim().split("\n")[1];
      if (!line) continue;

      const parts  = line.trim().split(/\s+/);
      const total  = parseInt(parts[0] ?? "0", 10);
      const used   = parseInt(parts[1] ?? "0", 10);
      const free   = parseInt(parts[2] ?? "0", 10);
      const pctStr = (parts[3] ?? "0%").replace("%", "");
      const usedPct = parseInt(pctStr, 10);

      results.push({ mountpoint: mount, totalBytes: total, usedBytes: used, freeBytes: free, usedPct });
    } catch { /* skip mount */ }
  }

  return results;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export async function analyzeSystem(): Promise<SystemState> {
  const [loadavg, freeMem, totalMem] = [os.loadavg(), os.freemem(), os.totalmem()];
  const memUsedPct = Math.round(((totalMem - freeMem) / totalMem) * 100);

  const [vms, containers, nodes, network, disks] = await Promise.all([
    getVMList(),
    analyzeContainers(),
    analyzeNodes(),
    analyzeInfraNetwork(),
    getDiskInfo(),
  ]);

  return {
    timestamp:     Date.now(),
    cpuLoad1m:     loadavg[0] ?? 0,
    cpuLoad5m:     loadavg[1] ?? 0,
    cpuLoad15m:    loadavg[2] ?? 0,
    freeMemBytes:  freeMem,
    totalMemBytes: totalMem,
    memUsedPct,
    vms,
    containers,
    nodes,
    network,
    disks,
  };
}
