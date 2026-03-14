/**
 * Hypervisor Manager
 *
 * Reads the hypervisor/host-level state via virsh and reports domain summary.
 * Does not issue VM actions directly (vm-manager handles those).
 *
 * Used by controller-core for top-level health reporting.
 *
 * SECURITY: execFile only — no shell interpolation.
 */
import { execFile as execFileCb } from "node:child_process";
import { promisify }              from "node:util";
import type { InfraAction }       from "../types.js";

const execFile = promisify(execFileCb);

export interface HypervisorInfo {
  available:   boolean;
  totalDomains: number;
  runningDomains: number;
  stoppedDomains: number;
}

export async function inspectHypervisor(): Promise<HypervisorInfo> {
  try {
    const { stdout } = await execFile("virsh", ["list", "--all"], { timeout: 8_000 });
    const lines = stdout.trim().split("\n").slice(2).filter(l => l.trim());

    let running = 0;
    let stopped = 0;

    for (const line of lines) {
      const state = line.trim().split(/\s+/).slice(2).join(" ").toLowerCase();
      if (state === "running") running++;
      else stopped++;
    }

    return { available: true, totalDomains: running + stopped, runningDomains: running, stoppedDomains: stopped };
  } catch {
    return { available: false, totalDomains: 0, runningDomains: 0, stoppedDomains: 0 };
  }
}

export async function manageHypervisor(): Promise<InfraAction[]> {
  // Hypervisor manager currently produces informational-only actions.
  // Actual VM control actions are handled by vm-manager based on SystemState.
  const info = await inspectHypervisor();

  if (!info.available) {
    return [{
      id:          crypto.randomUUID(),
      type:        "vm_start",
      target:      "hypervisor",
      description: "virsh is unavailable on this host. Hypervisor management is offline.",
      params:      { available: false },
      timestamp:   Date.now(),
      risk:        "high",
      autoExecute: false,
    }];
  }

  return [];
}
