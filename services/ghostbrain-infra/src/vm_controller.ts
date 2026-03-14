/**
 * GhostBrain Infra — VM Controller
 *
 * VM lifecycle management: list, start, stop, and soft-migrate across hypervisors.
 * Each VM operation targets a specific hypervisor REST base URL.
 */

import { request } from "undici";

export interface VmRecord {
  id:          string;
  name:        string;
  state:       "running" | "paused" | "shut_off" | "unknown";
  cpuPercent:  number;
  memUsedMb:   number;
  memTotalMb:  number;
  hypervisor:  string;  // source hypervisor URL
}

export type VmCommandResult = { ok: boolean; message: string; vmId: string; hypervisor: string };

interface LibvirtDomain {
  uuid?: string;
  name?: string;
  state?: string;
  cpuUsage?: number;
  maxMemory?: number;
  usedMemory?: number;
}

function stateOf(raw: string | undefined): VmRecord["state"] {
  switch (raw?.toLowerCase()) {
    case "running":  return "running";
    case "paused":   return "paused";
    case "shut_off":
    case "shutdown": return "shut_off";
    default:         return "unknown";
  }
}

async function hvGet<T>(hvUrl: string, path: string): Promise<T | null> {
  try {
    const res = await request(`${hvUrl}${path}`, {
      method: "GET",
      headers: { Accept: "application/json" },
      bodyTimeout: 6_000,
    });
    if (res.statusCode !== 200) return null;
    return await res.body.json() as T;
  } catch { return null; }
}

async function hvPost(hvUrl: string, path: string, body?: unknown): Promise<{ ok: boolean; status: number }> {
  try {
    const res = await request(`${hvUrl}${path}`, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    body !== undefined ? JSON.stringify(body) : undefined,
      bodyTimeout: 10_000,
    });
    return { ok: res.statusCode < 300, status: res.statusCode };
  } catch { return { ok: false, status: 0 }; }
}

export async function listVms(hvUrl: string): Promise<VmRecord[]> {
  const data = await hvGet<{ domains?: LibvirtDomain[] }>(hvUrl, "/domains");
  if (!data?.domains) return [];
  return data.domains.map(d => ({
    id:         d.uuid ?? d.name ?? "unknown",
    name:       d.name ?? "unknown",
    state:      stateOf(d.state),
    cpuPercent: d.cpuUsage ?? 0,
    memUsedMb:  Math.round((d.usedMemory ?? 0) / 1024),
    memTotalMb: Math.round((d.maxMemory  ?? 0) / 1024),
    hypervisor: hvUrl,
  }));
}

export async function startVm(hvUrl: string, vmId: string): Promise<VmCommandResult> {
  const r = await hvPost(hvUrl, `/domains/${vmId}/start`);
  return { ok: r.ok, message: r.ok ? "VM started" : `start failed (${r.status})`, vmId, hypervisor: hvUrl };
}

export async function stopVm(hvUrl: string, vmId: string, force = false): Promise<VmCommandResult> {
  const path = force ? `/domains/${vmId}/destroy` : `/domains/${vmId}/shutdown`;
  const r    = await hvPost(hvUrl, path);
  return { ok: r.ok, message: r.ok ? (force ? "VM destroyed" : "VM shutdown") : `stop failed (${r.status})`, vmId, hypervisor: hvUrl };
}

/**
 * Soft migration: shutdown on source → resume snapshot on target.
 * Real live migration requires shared storage; this implementation
 * shuts down the VM on source and starts it on target.
 */
export async function migrateVm(
  srcHvUrl: string,
  tgtHvUrl: string,
  vmId: string
): Promise<{ ok: boolean; message: string }> {
  // 1. Graceful shutdown on source
  const stopResult = await stopVm(srcHvUrl, vmId, false);
  if (!stopResult.ok) {
    return { ok: false, message: `Migration blocked: ${stopResult.message}` };
  }
  // 2. Start on target (assumes shared or pre-transferred disk image)
  const startResult = await startVm(tgtHvUrl, vmId);
  if (!startResult.ok) {
    return { ok: false, message: `Migrated shutdown OK but start on target failed: ${startResult.message}` };
  }
  return { ok: true, message: `VM ${vmId} migrated from ${srcHvUrl} to ${tgtHvUrl}` };
}
