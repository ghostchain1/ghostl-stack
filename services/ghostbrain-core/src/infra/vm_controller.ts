/**
 * GhostBrain Core — VM Controller
 *
 * Monitors virtualisation-layer resources.
 * Queries libvirt HTTP bridge (if available) or reads /proc for host stats.
 * Falls back gracefully to a host-level summary when libvirt is unavailable.
 */

import { request }             from "undici";
import { recordInfraSnapshot } from "../memory/infrastructure_memory.js";
import { readFileSync }        from "node:fs";

const LIBVIRT_REST_URL = process.env.LIBVIRT_REST_URL ?? ""; // e.g. http://localhost:8080

interface VmStat {
  name:    string;
  cpuPct:  number;
  memPct:  number;
  state:   string;
}

/** Attempt libvirt REST endpoint (virthost REST bridge). */
async function queryLibvirtRest(): Promise<VmStat[] | null> {
  if (!LIBVIRT_REST_URL) return null;
  try {
    const res = await request(`${LIBVIRT_REST_URL}/domains`, {
      method: "GET",
      headers: { Accept: "application/json" },
      bodyTimeout: 5_000,
    });
    if (res.statusCode !== 200) return null;
    const body = await res.body.json() as { domains?: VmStat[] };
    return body.domains ?? null;
  } catch {
    return null;
  }
}

/** Fallback: read host CPU and memory from /proc. */
function readHostStats(): { cpuPct: number; memPct: number } {
  try {
    // CPU: read /proc/stat for idle ratio approximation
    const statLines = readFileSync("/proc/stat", "utf8").split("\n");
    const cpuLine   = statLines.find(l => l.startsWith("cpu "));
    let cpuPct = 0;
    if (cpuLine) {
      const parts = cpuLine.split(/\s+/).slice(1).map(Number);
      const idle  = parts[3] ?? 0;
      const total = parts.reduce((a, b) => a + b, 0) || 1;
      cpuPct = ((total - idle) / total) * 100;
    }
    // Memory: /proc/meminfo
    const memInfo   = readFileSync("/proc/meminfo", "utf8");
    const memMap    = Object.fromEntries(
      memInfo.split("\n")
        .map(l => { const [k, v] = l.split(":"); return [k?.trim(), parseInt(v ?? "0")]; })
        .filter(([k]) => k),
    ) as Record<string, number>;
    const total = memMap["MemTotal"] ?? 1;
    const free  = (memMap["MemFree"] ?? 0) + (memMap["Buffers"] ?? 0) + (memMap["Cached"] ?? 0);
    const memPct = ((total - free) / total) * 100;
    return { cpuPct, memPct };
  } catch {
    return { cpuPct: 0, memPct: 0 };
  }
}

/** Collect VM + host snapshots into InfraMemory. */
export async function collectVmSnapshots(): Promise<{ processed: number; source: "libvirt" | "host" }> {
  const vms = await queryLibvirtRest();

  if (vms) {
    for (const vm of vms) {
      recordInfraSnapshot({
        ts:         Date.now(),
        layer:      "vm",
        resourceId: vm.name,
        cpuPct:     vm.cpuPct,
        memPct:     vm.memPct,
        diskIoPct:  0,
        netMbps:    0,
        restarts:   0,
        healthy:    vm.state === "running",
        meta:       { state: vm.state, source: "libvirt" },
      });
    }
    return { processed: vms.length, source: "libvirt" };
  }

  // Fallback: host-level stats
  const { cpuPct, memPct } = readHostStats();
  recordInfraSnapshot({
    ts:         Date.now(),
    layer:      "vm",
    resourceId: "host",
    cpuPct,
    memPct,
    diskIoPct:  0,
    netMbps:    0,
    restarts:   0,
    healthy:    true,
    meta:       { source: "proc" },
  });
  return { processed: 1, source: "host" };
}
