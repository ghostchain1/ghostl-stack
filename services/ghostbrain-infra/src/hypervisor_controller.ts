/**
 * GhostBrain Infra — Hypervisor Controller
 *
 * Manages multiple hypervisors via their libvirt REST bridges.
 * HYPERVISOR_URLS env: comma-separated libvirt REST base URLs.
 *
 * Responsibilities:
 *  - Poll all hypervisors for resource capacity
 *  - Select best hypervisor for workload placement
 *  - Detect overloaded hypervisors and trigger rebalance
 */

import { request } from "undici";

export interface HypervisorStatus {
  url:          string;
  id:           string;
  available:    boolean;
  cpuCores:     number;
  cpuFreePercent: number;
  memTotalMb:   number;
  memFreeMb:    number;
  vmCount:      number;
  loadScore:    number;  // 0 (idle) to 100 (saturated)
  lastPollAt:   number;
}

// HYPERVISOR_URLS: comma-separated list of libvirt REST bridge URLs
const HYPERVISOR_URLS: string[] = (process.env.HYPERVISOR_URLS ?? "")
  .split(",")
  .map(s => s.trim())
  .filter(Boolean);

const _statusMap = new Map<string, HypervisorStatus>();

interface LibvirtHostStats {
  cpuCores?: number;
  cpuFreePercent?: number;
  memTotalKib?: number;
  memFreeKib?: number;
  domainCount?: number;
}

async function pollHypervisor(url: string): Promise<HypervisorStatus> {
  const id = Buffer.from(url).toString("base64").slice(0, 12);
  try {
    const res = await request(`${url}/hoststats`, {
      method:      "GET",
      headers:     { Accept: "application/json" },
      bodyTimeout: 6_000,
    });
    if (res.statusCode !== 200) {
      return { url, id, available: false, cpuCores: 0, cpuFreePercent: 0, memTotalMb: 0, memFreeMb: 0, vmCount: 0, loadScore: 100, lastPollAt: Date.now() };
    }
    const data = await res.body.json() as LibvirtHostStats;
    const memTotalMb = Math.round((data.memTotalKib ?? 0) / 1024);
    const memFreeMb  = Math.round((data.memFreeKib  ?? 0) / 1024);
    const cpuFree    = data.cpuFreePercent ?? 100;
    const memUsedPct = memTotalMb > 0 ? ((memTotalMb - memFreeMb) / memTotalMb) * 100 : 0;
    // loadScore: weighted average of CPU and memory utilisation
    const loadScore  = Math.round((100 - cpuFree) * 0.6 + memUsedPct * 0.4);
    return {
      url, id,
      available:      true,
      cpuCores:       data.cpuCores ?? 1,
      cpuFreePercent: cpuFree,
      memTotalMb,
      memFreeMb,
      vmCount:        data.domainCount ?? 0,
      loadScore:      Math.min(100, Math.max(0, loadScore)),
      lastPollAt:     Date.now(),
    };
  } catch {
    return { url, id, available: false, cpuCores: 0, cpuFreePercent: 0, memTotalMb: 0, memFreeMb: 0, vmCount: 0, loadScore: 100, lastPollAt: Date.now() };
  }
}

export async function pollAllHypervisors(): Promise<HypervisorStatus[]> {
  const results = await Promise.all(HYPERVISOR_URLS.map(pollHypervisor));
  for (const s of results) _statusMap.set(s.url, s);
  return results;
}

export function getHypervisorStatus(): HypervisorStatus[] {
  return [..._statusMap.values()];
}

/** Select the least-loaded available hypervisor */
export function selectBestHypervisor(): HypervisorStatus | null {
  const available = [..._statusMap.values()].filter(h => h.available);
  if (!available.length) return null;
  return available.sort((a, b) => a.loadScore - b.loadScore)[0] ?? null;
}

export function hypervisorConfigured(): boolean {
  return HYPERVISOR_URLS.length > 0;
}
