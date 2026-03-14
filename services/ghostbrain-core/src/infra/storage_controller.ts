/**
 * GhostBrain Core — Storage Controller
 *
 * Monitors disk usage on the host (via /proc/mounts + statvfs-style
 * df parsing) and Docker volume disk usage. Provides volume expansion
 * hooks for libvirt / hypervisor REST endpoints.
 */

import { readFile }   from "node:fs/promises";
import { statfs }     from "node:fs/promises";
import { request }    from "undici";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface MountPoint {
  device:    string;
  mountPath: string;
  fsType:    string;
  totalGb:   number;
  usedGb:    number;
  freeGb:    number;
  usePercent: number;
}

export interface DockerVolume {
  name:       string;
  driver:     string;
  mountPoint: string;
}

export interface StorageStatus {
  mounts:        MountPoint[];
  dockerVolumes: DockerVolume[];
  pressureFlag:  boolean;   // true if any mount > DISK_PRESSURE_THRESHOLD
  ts:            number;
}

export interface ExpandResult {
  ok:     boolean;
  volume: string;
  error?: string;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const DISK_PRESSURE_THRESHOLD = Number(
  process.env.DISK_PRESSURE_THRESHOLD ?? "80",
);

const DOCKER_SOCKET = process.env.DOCKER_SOCKET ?? "/var/run/docker.sock";
const HYPERVISOR_URLS = (process.env.HYPERVISOR_URLS ?? "").split(",").filter(Boolean);

// ── /proc/mounts parser ───────────────────────────────────────────────────────

/** Returns interesting (non-virtual) mount points with usage stats. */
export async function readMountPoints(): Promise<MountPoint[]> {
  const SKIP_FS   = new Set(["tmpfs", "devtmpfs", "sysfs", "proc", "cgroup", "cgroup2",
                              "devpts", "overlay", "squashfs", "securityfs"]);
  const SKIP_DEV  = /^(none|udev|devtmpfs|tmpfs)$/;
  try {
    const mounts  = await readFile("/proc/mounts", "utf8");
    const lines   = mounts.split("\n").filter(Boolean);
    const results: MountPoint[] = [];

    for (const line of lines) {
      const parts = line.split(" ");
      const dev   = parts[0] ?? "";
      const path  = parts[1] ?? "";
      const fs    = parts[2] ?? "";

      if (SKIP_FS.has(fs)) continue;
      if (SKIP_DEV.test(dev)) continue;
      if (path.startsWith("/sys") || path.startsWith("/proc") || path.startsWith("/dev")) continue;

      try {
        const st = await statfs(path);
        const blockSize = st.bsize;
        const totalGb = (st.blocks  * blockSize) / 1e9;
        const freeGb  = (st.bfree   * blockSize) / 1e9;
        const usedGb  = totalGb - freeGb;
        results.push({
          device:     dev,
          mountPath:  path,
          fsType:     fs,
          totalGb:    +totalGb.toFixed(2),
          usedGb:     +usedGb.toFixed(2),
          freeGb:     +freeGb.toFixed(2),
          usePercent: totalGb > 0 ? +((usedGb / totalGb) * 100).toFixed(1) : 0,
        });
      } catch { /* unmounted race – skip */ }
    }
    return results;
  } catch {
    return [];
  }
}

// ── Docker volumes ────────────────────────────────────────────────────────────

function dockerUrl(path: string): string {
  const base = DOCKER_SOCKET.startsWith("/") ? `unix://${DOCKER_SOCKET}` : DOCKER_SOCKET;
  return `${base}${path}`;
}

export async function listDockerVolumes(): Promise<DockerVolume[]> {
  try {
    const res = await request(dockerUrl("/volumes"), { method: "GET", bodyTimeout: 5_000 });
    const raw = await res.body.json() as { Volumes: { Name: string; Driver: string; Mountpoint: string }[] };
    return (raw.Volumes ?? []).map(v => ({
      name:       v.Name,
      driver:     v.Driver,
      mountPoint: v.Mountpoint,
    }));
  } catch {
    return [];
  }
}

// ── Full status snapshot ──────────────────────────────────────────────────────

export async function getStorageStatus(): Promise<StorageStatus> {
  const [mounts, dockerVolumes] = await Promise.all([readMountPoints(), listDockerVolumes()]);
  const pressureFlag = mounts.some(m => m.usePercent >= DISK_PRESSURE_THRESHOLD);
  return { mounts, dockerVolumes, pressureFlag, ts: Date.now() };
}

// ── Volume expansion (libvirt REST) ───────────────────────────────────────────

/**
 * Request a volume resize from the hypervisor REST bridge.
 * Requires HYPERVISOR_URLS to be configured.
 */
export async function expandVolume(volumeName: string, newCapacityGb: number): Promise<ExpandResult> {
  if (HYPERVISOR_URLS.length === 0) {
    return { ok: false, volume: volumeName, error: "no HYPERVISOR_URLS configured" };
  }
  const hvUrl = HYPERVISOR_URLS[0]!;
  try {
    const res = await request(`${hvUrl}/volumes/${encodeURIComponent(volumeName)}/expand`, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ capacityGb: newCapacityGb }),
      bodyTimeout: 15_000,
    });
    return { ok: res.statusCode === 200, volume: volumeName };
  } catch (e) {
    return { ok: false, volume: volumeName, error: e instanceof Error ? e.message : String(e) };
  }
}
