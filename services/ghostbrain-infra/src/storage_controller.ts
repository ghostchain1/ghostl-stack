/**
 * GhostBrain Infra — Storage Controller
 *
 * Monitors disk usage across agent nodes and provides expansion commands
 * via libvirt storage pool REST API.
 */

import { request } from "undici";

export interface StorageVolume {
  hvUrl:      string;
  pool:       string;
  name:       string;
  capacityGb: number;
  allocationGb: number;
  freeGb:     number;
  usedPercent: number;
}

export interface DiskPressure {
  hvUrl:      string;
  pool:       string;
  name:       string;
  usedPercent: number;
}

const HYPERVISOR_URLS: string[] = (process.env.HYPERVISOR_URLS ?? "")
  .split(",")
  .map(s => s.trim())
  .filter(Boolean);

const DISK_PRESSURE_THRESHOLD = 80; // percent

interface LibvirtVolume {
  name?: string;
  capacity?: number;     // bytes
  allocation?: number;   // bytes
}

interface LibvirtPool {
  name?: string;
  volumes?: LibvirtVolume[];
}

async function getPoolVolumes(hvUrl: string): Promise<StorageVolume[]> {
  try {
    const res = await request(`${hvUrl}/storagepools`, {
      method:      "GET",
      headers:     { Accept: "application/json" },
      bodyTimeout: 6_000,
    });
    if (res.statusCode !== 200) return [];
    const data = await res.body.json() as { pools?: LibvirtPool[] };
    const pools = data?.pools ?? [];
    const volumes: StorageVolume[] = [];
    for (const pool of pools) {
      for (const vol of pool.volumes ?? []) {
        const capacityGb    = Math.round((vol.capacity   ?? 0) / 1024 / 1024 / 1024 * 10) / 10;
        const allocationGb  = Math.round((vol.allocation ?? 0) / 1024 / 1024 / 1024 * 10) / 10;
        const usedPercent   = capacityGb > 0 ? (allocationGb / capacityGb) * 100 : 0;
        volumes.push({
          hvUrl,
          pool:        pool.name ?? "default",
          name:        vol.name  ?? "unknown",
          capacityGb,
          allocationGb,
          freeGb:      Math.max(0, capacityGb - allocationGb),
          usedPercent,
        });
      }
    }
    return volumes;
  } catch { return []; }
}

export async function getStorageStatus(): Promise<{ volumes: StorageVolume[]; pressure: DiskPressure[] }> {
  const perHv = await Promise.all(HYPERVISOR_URLS.map(getPoolVolumes));
  const volumes = perHv.flat();
  const pressure = volumes
    .filter(v => v.usedPercent >= DISK_PRESSURE_THRESHOLD)
    .map(v => ({ hvUrl: v.hvUrl, pool: v.pool, name: v.name, usedPercent: v.usedPercent }));
  return { volumes, pressure };
}

/**
 * Request volume expansion via libvirt REST.
 * The hypervisor REST bridge must support PATCH /volumes/{name} with { capacityGb }.
 */
export async function expandVolume(
  hvUrl:        string,
  volumeName:   string,
  newCapacityGb: number
): Promise<{ ok: boolean; message: string }> {
  try {
    const res = await request(`${hvUrl}/volumes/${encodeURIComponent(volumeName)}`, {
      method:  "PATCH",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ capacityGb: newCapacityGb }),
      bodyTimeout: 15_000,
    });
    return {
      ok:      res.statusCode < 300,
      message: res.statusCode < 300
        ? `volume ${volumeName} expanded to ${newCapacityGb} GB`
        : `expansion failed (${res.statusCode})`,
    };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "unknown error" };
  }
}
