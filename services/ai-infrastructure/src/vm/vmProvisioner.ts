/**
 * vmProvisioner.ts — libvirt VM lifecycle management
 *
 * Interacts with the hypervisor via the `virsh` CLI tool.  All VM names are
 * strictly validated before being passed as arguments to spawn() — the args
 * array API is used throughout so no shell interpolation ever occurs.
 *
 * Set AIE_ENABLE_VIRSH=true to enable live virsh commands.
 * Default: dry-run mode (commands are logged but not executed).
 */

import { spawn } from "child_process";
import logger from "../utils/logger";

export interface VmRecord {
  name: string;
  id: string;
  state: "running" | "shut off" | "paused" | "crashed" | "unknown";
}

export interface VmProvisionConfig {
  name: string;
  memoryMB: number;
  vcpus: number;
  diskGB: number;
  osVariant?: string;
  network?: string;
}

export interface ProvisionEvent {
  timestamp: string;
  action: "create" | "start" | "stop" | "delete" | "list";
  target: string;
  dryRun: boolean;
  success: boolean;
  error?: string;
}

const VIRSH_ENABLED = process.env.AIE_ENABLE_VIRSH === "true";
const MAX_DISK_GB   = Number(process.env.AIE_VM_MAX_DISK_GB   ?? 500);
const MAX_MEM_MB    = Number(process.env.AIE_VM_MAX_MEM_MB    ?? 32768);
const MAX_VCPUS     = Number(process.env.AIE_VM_MAX_VCPUS     ?? 16);

const provisionLog: ProvisionEvent[] = [];

// ── Input validation ──────────────────────────────────────────────────────────
// VM names: lowercase alphanumeric + hyphens, 3–50 chars, no leading/trailing hyphen.
const VM_NAME_RE = /^[a-z0-9]([a-z0-9-]{1,48}[a-z0-9])?$/;

function validateVmName(name: string): string {
  if (!VM_NAME_RE.test(name)) {
    throw new Error(`Invalid VM name "${name}". Must match ^[a-z0-9][a-z0-9-]{1,48}[a-z0-9]$`);
  }
  return name;
}

function validateConfig(cfg: VmProvisionConfig): void {
  validateVmName(cfg.name);
  if (cfg.memoryMB < 512 || cfg.memoryMB > MAX_MEM_MB)
    throw new Error(`memoryMB must be 512–${MAX_MEM_MB}`);
  if (cfg.vcpus < 1 || cfg.vcpus > MAX_VCPUS)
    throw new Error(`vcpus must be 1–${MAX_VCPUS}`);
  if (cfg.diskGB < 5 || cfg.diskGB > MAX_DISK_GB)
    throw new Error(`diskGB must be 5–${MAX_DISK_GB}`);
  // osVariant and network are optional strings; validate if present
  if (cfg.osVariant && !/^[\w.-]+$/.test(cfg.osVariant))
    throw new Error("osVariant contains invalid characters");
  if (cfg.network && !/^[\w-]+$/.test(cfg.network))
    throw new Error("network contains invalid characters");
}

// ── virsh wrapper ─────────────────────────────────────────────────────────────

function runVirsh(args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    logger.debug(`[VmProvisioner] virsh ${args.join(" ")}`);
    const proc = spawn("virsh", args, { stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    proc.stdout.on("data", (d: Buffer) => { stdout += d.toString(); });
    proc.stderr.on("data", (d: Buffer) => { stderr += d.toString(); });
    proc.on("close", (code) =>
      code === 0 ? resolve(stdout) : reject(new Error(stderr || `virsh exit ${code}`)),
    );
  });
}

function logEvent(event: ProvisionEvent) {
  provisionLog.unshift(event);
  if (provisionLog.length > 100) provisionLog.pop();
}

// ── Public API ────────────────────────────────────────────────────────────────

export async function listVMs(): Promise<VmRecord[]> {
  if (!VIRSH_ENABLED) {
    logger.info("[VmProvisioner] DRY-RUN: would call virsh list --all");
    return [
      { name: "ghost-validator-01", id: "1", state: "running" },
      { name: "ghost-rpc-01",       id: "2", state: "running" },
      { name: "ghost-monitor-01",   id: "3", state: "shut off" },
    ];
  }
  try {
    const out = await runVirsh(["list", "--all"]);
    const lines = out.split("\n").slice(2).filter((l) => l.trim());
    return lines.map((l) => {
      const parts = l.trim().split(/\s+/);
      return {
        id:    parts[0] ?? "-",
        name:  parts[1] ?? "unknown",
        state: (parts.slice(2).join(" ") ?? "unknown") as VmRecord["state"],
      };
    });
  } catch (err) {
    logger.error("[VmProvisioner] Failed to list VMs", { err: String(err) });
    return [];
  }
}

export async function createVM(cfg: VmProvisionConfig): Promise<ProvisionEvent> {
  const event: ProvisionEvent = {
    timestamp: new Date().toISOString(),
    action: "create",
    target: cfg.name,
    dryRun: !VIRSH_ENABLED,
    success: false,
  };
  try {
    validateConfig(cfg);
  } catch (err) {
    event.error = String(err);
    logEvent(event);
    logger.error("[VmProvisioner] Validation failed", { err: String(err) });
    return event;
  }

  if (!VIRSH_ENABLED) {
    logger.info(`[VmProvisioner] DRY-RUN: virt-install --name ${cfg.name} --memory ${cfg.memoryMB} --vcpus ${cfg.vcpus} --disk size=${cfg.diskGB}`);
    event.success = true;
    logEvent(event);
    return event;
  }

  // Use virt-install with args array — no shell interpolation
  const args = [
    "--name",   cfg.name,
    "--memory", String(cfg.memoryMB),
    "--vcpus",  String(cfg.vcpus),
    "--disk",   `size=${cfg.diskGB}`,
    "--noautoconsole",
    "--import",
  ];
  if (cfg.osVariant) args.push("--os-variant", cfg.osVariant);
  if (cfg.network)   args.push("--network",    `network=${cfg.network}`);

  try {
    await new Promise<void>((resolve, reject) => {
      const proc = spawn("virt-install", args, { stdio: "ignore" });
      proc.on("close", (code) =>
        code === 0 ? resolve() : reject(new Error(`virt-install exit ${code}`)),
      );
    });
    event.success = true;
    logger.info(`[VmProvisioner] Created VM: ${cfg.name}`);
  } catch (err) {
    event.error = String(err);
    logger.error(`[VmProvisioner] Failed to create VM: ${cfg.name}`, { err: String(err) });
  }

  logEvent(event);
  return event;
}

export async function startVM(name: string): Promise<ProvisionEvent> {
  const safeName = validateVmName(name);
  const event: ProvisionEvent = { timestamp: new Date().toISOString(), action: "start", target: safeName, dryRun: !VIRSH_ENABLED, success: false };
  if (!VIRSH_ENABLED) { logger.info(`[VmProvisioner] DRY-RUN: virsh start ${safeName}`); event.success = true; logEvent(event); return event; }
  try { await runVirsh(["start", safeName]); event.success = true; logger.info(`[VmProvisioner] Started VM: ${safeName}`); }
  catch (err) { event.error = String(err); logger.error(`[VmProvisioner] Failed to start ${safeName}`, { err: String(err) }); }
  logEvent(event); return event;
}

export async function stopVM(name: string): Promise<ProvisionEvent> {
  const safeName = validateVmName(name);
  const event: ProvisionEvent = { timestamp: new Date().toISOString(), action: "stop", target: safeName, dryRun: !VIRSH_ENABLED, success: false };
  if (!VIRSH_ENABLED) { logger.info(`[VmProvisioner] DRY-RUN: virsh shutdown ${safeName}`); event.success = true; logEvent(event); return event; }
  try { await runVirsh(["shutdown", safeName]); event.success = true; }
  catch (err) { event.error = String(err); }
  logEvent(event); return event;
}

export function getProvisionLog(): ProvisionEvent[] { return provisionLog.slice(0, 50); }
