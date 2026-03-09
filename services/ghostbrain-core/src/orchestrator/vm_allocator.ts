/**
 * GhostBrain — VM Allocator
 *
 * Decides VM placement and sizing when the orchestrator needs to
 * scale or migrate a VM workload. Queries the hypervisor REST bridge
 * to find available capacity and confirms the best target host.
 *
 * Decision factors (weighted):
 *   1. remaining CPU capacity (weight 0.4)
 *   2. remaining RAM          (weight 0.4)
 *   3. disk free              (weight 0.2)
 */

import { request } from "undici";

const HYPERVISOR_URLS = (process.env.HYPERVISOR_URLS ?? "").split(",").filter(Boolean);

// ── Types ─────────────────────────────────────────────────────────────────────

export interface HvCapacity {
  url:         string;
  cpuFreePercent: number;
  memFreeMb:   number;
  diskFreeGb:  number;
  score:       number;   // lower = more preferred
}

export interface VmPlacementReq {
  vcpus:     number;
  memMb:     number;
  diskGb:    number;
}

export interface VmPlacementResult {
  ok:       boolean;
  hypervisorUrl: string;
  reason:   string;
}

// ── Heuristic ─────────────────────────────────────────────────────────────────

function scoreHv(h: HvCapacity): number {
  // lower score = more capacity
  const cpuLoad = 100 - h.cpuFreePercent;
  const memLoad = h.memFreeMb > 0 ? Math.max(0, 100 - (h.memFreeMb / 1024)) : 100;
  const diskLoad = h.diskFreeGb > 0 ? Math.max(0, 100 - h.diskFreeGb) : 100;
  return cpuLoad * 0.4 + memLoad * 0.4 + diskLoad * 0.2;
}

// ── Hypervisor polling ────────────────────────────────────────────────────────

async function pollHypervisor(url: string): Promise<HvCapacity | null> {
  try {
    const res = await request(`${url}/hoststats`, { method: "GET", bodyTimeout: 6_000 });
    if (res.statusCode !== 200) return null;
    const j = await res.body.json() as { cpuFreePercent?: number; memFreeMb?: number; diskFreeGb?: number };
    const h: HvCapacity = {
      url,
      cpuFreePercent: j.cpuFreePercent ?? 0,
      memFreeMb:      j.memFreeMb      ?? 0,
      diskFreeGb:     j.diskFreeGb     ?? 0,
      score:          0,
    };
    h.score = scoreHv(h);
    return h;
  } catch {
    return null;
  }
}

export async function getAllHypervisorCapacity(): Promise<HvCapacity[]> {
  if (HYPERVISOR_URLS.length === 0) return [];
  const results = await Promise.all(HYPERVISOR_URLS.map(pollHypervisor));
  return results.filter((h): h is HvCapacity => h !== null)
                .sort((a, b) => a.score - b.score);
}

// ── Placement decision ────────────────────────────────────────────────────────

/** Select the best hypervisor for a new VM based on resource requirements. */
export async function selectVmPlacement(req: VmPlacementReq): Promise<VmPlacementResult> {
  const capacities = await getAllHypervisorCapacity();
  if (capacities.length === 0) {
    return { ok: false, hypervisorUrl: "", reason: "no hypervisors available or configured" };
  }

  // Filter to hosts that have enough headroom
  const MIN_CPU_FREE = 10;
  const candidates = capacities.filter(h =>
    h.cpuFreePercent >= MIN_CPU_FREE &&
    h.memFreeMb >= req.memMb * 1.1 &&  // 10% headroom
    h.diskFreeGb >= req.diskGb * 1.1,
  );

  if (candidates.length === 0) {
    return {
      ok: false,
      hypervisorUrl: "",
      reason: `insufficient capacity for ${req.vcpus} vCPU / ${req.memMb}MB / ${req.diskGb}GB`,
    };
  }

  const best = candidates[0]!;
  return {
    ok: true,
    hypervisorUrl: best.url,
    reason: `selected hypervisor with load score ${best.score.toFixed(1)}`,
  };
}
