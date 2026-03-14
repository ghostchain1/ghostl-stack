/**
 * autoRepair.ts — Service auto-repair engine
 *
 * Maintains a registry of monitored HTTP endpoints. On each repair cycle it
 * probes every endpoint; any that are unreachable are passed to the registered
 * repair handler (Docker restart, systemd restart, or a custom callback).
 *
 * AIE_REPAIR_ENABLED=true enables live repair actions.
 * Default is dry-run mode — actions are logged but not executed.
 */

import axios from "axios";
import logger from "../utils/logger";

export type RepairMethod = "docker" | "systemd" | "callback";

export interface ServiceRegistration {
  id: string;
  label: string;
  healthUrl: string;
  method: RepairMethod;
  /** Docker container name or systemd unit name */
  target?: string;
  /** Custom callback invoked when the service fails (used when method=callback) */
  repairCallback?: () => Promise<void>;
  consecutiveFailures: number;
  lastChecked: string;
  lastStatus: "healthy" | "failed" | "unknown";
}

export interface RepairEvent {
  timestamp: string;
  serviceId: string;
  label: string;
  method: RepairMethod;
  action: string;
  dryRun: boolean;
  success: boolean;
  error?: string;
}

const REPAIR_ENABLED = process.env.AIE_REPAIR_ENABLED === "true";
const FAILURE_THRESHOLD = 2; // consecutive failures before repair
const MAX_LOG = 200;

// ── Registry ──────────────────────────────────────────────────────────────────

const registry: Map<string, ServiceRegistration> = new Map();
const repairLog: RepairEvent[] = [];

// Pre-populate with known GhostStack services
const DEFAULT_SERVICES: Omit<ServiceRegistration, "consecutiveFailures" | "lastChecked" | "lastStatus">[] = [
  { id: "scp",   label: "Control Plane (SCP)",     healthUrl: `http://localhost:${process.env.SCP_PORT     ?? 9500}/health`, method: "docker",  target: "scp" },
  { id: "aim",   label: "AI Infra Manager (AIM)",  healthUrl: `http://localhost:${process.env.AIM_PORT     ?? 9950}/health`, method: "docker",  target: "aim" },
  { id: "uo",    label: "Orchestrator (UO)",        healthUrl: `http://localhost:${process.env.UO_PORT      ?? 9990}/health`, method: "docker",  target: "uo" },
  { id: "aims",  label: "AI Marketing (AIMS)",      healthUrl: `http://localhost:${process.env.AIMS_PORT    ?? 9970}/health`, method: "docker",  target: "ai-marketing" },
  { id: "vge",   label: "Viral Growth (VGE)",       healthUrl: `http://localhost:${process.env.VGE_PORT     ?? 9971}/health`, method: "docker",  target: "ai-growth" },
  { id: "aae",   label: "Adoption Engine (AAE)",    healthUrl: `http://localhost:${process.env.AAE_PORT     ?? 9972}/health`, method: "docker",  target: "ai-adoption" },
  { id: "gee",   label: "Expansion Engine (GEE)",   healthUrl: `http://localhost:${process.env.GEE_PORT     ?? 9973}/health`, method: "docker",  target: "ai-expansion" },
  { id: "aee",   label: "Autonomous Economy (AEE)", healthUrl: `http://localhost:${process.env.AEE_PORT     ?? 9974}/health`, method: "docker",  target: "ai-economy" },
];

export function initRegistry() {
  for (const svc of DEFAULT_SERVICES) {
    registry.set(svc.id, {
      ...svc,
      consecutiveFailures: 0,
      lastChecked: new Date().toISOString(),
      lastStatus: "unknown",
    });
  }
}

export function registerService(svc: Omit<ServiceRegistration, "consecutiveFailures" | "lastChecked" | "lastStatus">) {
  registry.set(svc.id, { ...svc, consecutiveFailures: 0, lastChecked: new Date().toISOString(), lastStatus: "unknown" });
}

// ── Health probe ──────────────────────────────────────────────────────────────

async function probeService(svc: ServiceRegistration): Promise<boolean> {
  try {
    const r = await axios.get(svc.healthUrl, { timeout: 4000 });
    return r.status >= 200 && r.status < 300;
  } catch {
    return false;
  }
}

// ── Repair actions ────────────────────────────────────────────────────────────

async function repairDockerContainer(target: string, dryRun: boolean): Promise<{ success: boolean; error?: string }> {
  if (dryRun) {
    logger.info(`[AutoRepair] DRY-RUN: would restart Docker container "${target}"`);
    return { success: true };
  }
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const Docker = require("dockerode") as typeof import("dockerode");
    const docker = new Docker();
    await docker.getContainer(target).restart({ t: 15 });
    return { success: true };
  } catch (err) {
    return { success: false, error: String(err) };
  }
}

async function repairSystemdService(unit: string, dryRun: boolean): Promise<{ success: boolean; error?: string }> {
  if (dryRun) {
    logger.info(`[AutoRepair] DRY-RUN: would run "systemctl restart ${unit}"`);
    return { success: true };
  }
  const { spawn } = await import("child_process");
  return new Promise((resolve) => {
    // Unit name validation: only word chars, hyphens, dots and @ — no shell injection possible
    if (!/^[\w@.-]+\.service$/.test(unit)) {
      resolve({ success: false, error: "Invalid unit name" });
      return;
    }
    const proc = spawn("systemctl", ["restart", unit], { stdio: "ignore" });
    proc.on("close", (code) =>
      resolve(code === 0 ? { success: true } : { success: false, error: `exit ${code}` }),
    );
  });
}

// ── Main repair cycle ─────────────────────────────────────────────────────────

export async function runRepairCycle(): Promise<RepairEvent[]> {
  const cycleEvents: RepairEvent[] = [];

  for (const svc of registry.values()) {
    const healthy = await probeService(svc);
    svc.lastChecked = new Date().toISOString();

    if (healthy) {
      svc.lastStatus = "healthy";
      svc.consecutiveFailures = 0;
      continue;
    }

    svc.lastStatus = "failed";
    svc.consecutiveFailures++;

    if (svc.consecutiveFailures < FAILURE_THRESHOLD) {
      logger.warn(`[AutoRepair] ${svc.label} unhealthy (${svc.consecutiveFailures}/${FAILURE_THRESHOLD})`);
      continue;
    }

    logger.warn(`[AutoRepair] Triggering repair for ${svc.label}`);

    let result: { success: boolean; error?: string } = { success: false, error: "no repair handler" };
    const dryRun = !REPAIR_ENABLED;

    if (svc.method === "docker" && svc.target) {
      result = await repairDockerContainer(svc.target, dryRun);
    } else if (svc.method === "systemd" && svc.target) {
      result = await repairSystemdService(svc.target, dryRun);
    } else if (svc.method === "callback" && svc.repairCallback) {
      try {
        if (!dryRun) await svc.repairCallback();
        result = { success: true };
      } catch (err) {
        result = { success: false, error: String(err) };
      }
    }

    const event: RepairEvent = {
      timestamp: new Date().toISOString(),
      serviceId: svc.id,
      label:     svc.label,
      method:    svc.method,
      action:    `restart ${svc.target ?? svc.id}`,
      dryRun,
      ...result,
    };

    cycleEvents.push(event);
    repairLog.unshift(event);
    if (repairLog.length > MAX_LOG) repairLog.pop();

    if (result.success) {
      svc.consecutiveFailures = 0;
      logger.info(`[AutoRepair] Successfully repaired ${svc.label}`, { dryRun });
    } else {
      logger.error(`[AutoRepair] Repair failed for ${svc.label}`, { error: result.error });
    }
  }

  return cycleEvents;
}

export function getRepairLog(): RepairEvent[] { return repairLog.slice(0, 50); }
export function getRegisteredServices(): ServiceRegistration[] { return [...registry.values()]; }
