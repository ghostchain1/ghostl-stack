/**
 * GhostBrain Agent — VM Monitor
 *
 * Queries local VMs via libvirt REST bridge (LIBVIRT_REST_URL).
 * Falls back to zeroed stats + a synthetic "host" entry when libvirt is unavailable.
 */

import { request } from "undici";

export interface VmInfo {
  id: string;
  name: string;
  state: "running" | "paused" | "shut_off" | "unknown";
  cpuPercent: number;
  memUsedMb: number;
  memTotalMb: number;
  source: "libvirt" | "unavailable";
}

const LIBVIRT_REST_URL = process.env.LIBVIRT_REST_URL ?? "";

interface LibvirtDomain {
  uuid?: string;
  name?: string;
  state?: string;
  cpuUsage?: number;
  maxMemory?: number;   // kibibytes
  usedMemory?: number;  // kibibytes
}

function canonicalState(raw: string | undefined): VmInfo["state"] {
  switch (raw?.toLowerCase()) {
    case "running":  return "running";
    case "paused":   return "paused";
    case "shut_off":
    case "shutdown": return "shut_off";
    default:         return "unknown";
  }
}

async function queryLibvirtRest(): Promise<VmInfo[]> {
  const res = await request(`${LIBVIRT_REST_URL}/domains`, {
    method: "GET",
    headers: { Accept: "application/json" },
    bodyTimeout: 5_000,
  });
  if (res.statusCode !== 200) return [];
  const json = await res.body.json() as { domains?: LibvirtDomain[] };
  const domains = json?.domains ?? [];
  return domains.map(d => ({
    id:         d.uuid ?? d.name ?? "unknown",
    name:       d.name ?? "unknown",
    state:      canonicalState(d.state),
    cpuPercent: d.cpuUsage ?? 0,
    memUsedMb:  Math.round((d.usedMemory ?? 0) / 1024),
    memTotalMb: Math.round((d.maxMemory  ?? 0) / 1024),
    source:     "libvirt" as const,
  }));
}

export async function collectVmInfo(): Promise<VmInfo[]> {
  if (!LIBVIRT_REST_URL) return [];
  try {
    return await queryLibvirtRest();
  } catch {
    return [];
  }
}
