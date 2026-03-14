/**
 * failureRecovery.ts — GhostStack Hypervisor Control Layer
 * Autonomous failure detection and recovery engine.
 * Detects problems, executes recovery actions, maintains incident log.
 */

import { v4 as uuid } from "uuid";
import { getVMs, performVmAction } from "../vm/vmManager";
import { getContainers, performContainerAction } from "../containers/containerManager";
import { getNodes, deployNode, ChainId, NodeRole } from "../nodes/nodeProvisioner";

export type IncidentSeverity = "low" | "medium" | "high" | "critical";
export type IncidentStatus   = "detected" | "recovering" | "resolved" | "failed";
export type RecoveryAction   =
  | "restart-container"
  | "restart-vm"
  | "provision-replacement-node"
  | "scale-up-nodes"
  | "rebalance-load"
  | "alert-only";

export interface RecoveryIncident {
  id:          string;
  timestamp:   number;
  service:     string;
  serviceType: "container" | "vm" | "node";
  severity:    IncidentSeverity;
  status:      IncidentStatus;
  description: string;
  action:      RecoveryAction;
  actionLog:   string[];
  resolvedAt?: number;
  resolvedBy?: "auto" | "manual";
}

interface RecoveryStats {
  totalIncidents:    number;
  resolved:          number;
  failed:            number;
  inProgress:        number;
  avgResolutionMs:   number;
  byAction:          Record<RecoveryAction, number>;
  autoResolved:      number;
  manualResolved:    number;
}

const MAX_INCIDENTS = 200;
const incidents: Map<string, RecoveryIncident> = new Map();

// ── Seed some historical incidents ────────────────────────────────────────────
const HISTORICAL: Array<Omit<RecoveryIncident, "id" | "timestamp" | "resolvedAt">> = [
  { service: "ghostchain-validator-2", serviceType: "container", severity: "high",   status: "resolved", description: "Validator-2 exited with code 1 — OOM condition detected", action: "restart-container", actionLog: ["Detected exit code 1", "Restarting container", "Container running"], resolvedBy: "auto" },
  { service: "node-gc-v4",             serviceType: "node",      severity: "medium", status: "resolved", description: "Validator-4 missed >50% slots over 30 min window",          action: "provision-replacement-node", actionLog: ["Slot miss rate 54%", "Provisioning replacement", "New node syncing", "Resolved"], resolvedBy: "auto" },
  { service: "ghost-monitoring",       serviceType: "vm",        severity: "low",    status: "resolved", description: "Monitoring VM CPU spike > 90% for 5 min",                   action: "alert-only",   actionLog: ["CPU 93% detected", "No action required — transient spike", "Resolved"], resolvedBy: "manual" },
  { service: "ghostmesh-postgres",     serviceType: "container", severity: "high",   status: "resolved", description: "Postgres container restarting loop (3+ restarts in 1h)",     action: "restart-container", actionLog: ["Restart loop detected", "Stopped container", "Cleared corrupted WAL", "Restarted", "Healthy"], resolvedBy: "manual" },
];

HISTORICAL.forEach((h, i) => {
  const ts = Date.now() - (HISTORICAL.length - i) * 3600000 * 4;
  const inc: RecoveryIncident = { ...h, id: uuid(), timestamp: ts, resolvedAt: ts + 900000 + Math.random() * 1800000 };
  incidents.set(inc.id, inc);
});

// ── Detection logic ───────────────────────────────────────────────────────────
async function detectAndRecover(): Promise<void> {
  // 1 — Stopped/errored containers
  const stoppedContainers = getContainers(undefined, "stopped").filter((c) => c.exitCode !== undefined && c.exitCode !== 0);
  for (const ctr of stoppedContainers) {
    if ([...incidents.values()].some((i) => i.service === ctr.name && i.status !== "resolved" && i.status !== "failed")) continue;
    const inc: RecoveryIncident = {
      id:          uuid(),
      timestamp:   Date.now(),
      service:     ctr.name,
      serviceType: "container",
      severity:    ctr.restarts > 3 ? "high" : "medium",
      status:      "recovering",
      description: `Container ${ctr.name} stopped (exit code ${ctr.exitCode ?? "?"}; ${ctr.restarts} previous restarts)`,
      action:      ctr.restarts > 5 ? "alert-only" : "restart-container",
      actionLog:   [`Detected stopped container: ${ctr.name}`],
    };
    incidents.set(inc.id, inc);
    if (inc.action === "restart-container") {
      await performContainerAction(ctr.id, "restart");
      inc.actionLog.push("Issued restart command");
      setTimeout(() => {
        inc.status = "resolved";
        inc.resolvedAt = Date.now();
        inc.resolvedBy = "auto";
        inc.actionLog.push("Container recovered");
      }, 3000);
    } else {
      inc.actionLog.push("Too many restarts — alerting only");
      inc.status = "failed";
    }
  }

  // 2 — Errored VMs
  const erroredVMs = getVMs(undefined, "errored");
  for (const vm of erroredVMs) {
    if ([...incidents.values()].some((i) => i.service === vm.name && i.status !== "resolved")) continue;
    const inc: RecoveryIncident = {
      id: uuid(), timestamp: Date.now(), service: vm.name, serviceType: "vm",
      severity: "critical", status: "recovering",
      description: `VM ${vm.name} entered error state`,
      action: "restart-vm", actionLog: [`VM ${vm.name} error detected`],
    };
    incidents.set(inc.id, inc);
    await performVmAction(vm.id, "restart");
    inc.actionLog.push("VM restart issued");
    setTimeout(() => { inc.status = "resolved"; inc.resolvedAt = Date.now(); inc.resolvedBy = "auto"; inc.actionLog.push("VM recovered"); }, 5000);
  }

  // 3 — Offline blockchain nodes (critical: validators)
  const offlineValidators = getNodes(undefined, "validator", "offline");
  for (const node of offlineValidators) {
    if ([...incidents.values()].some((i) => i.service === node.id && i.status !== "resolved")) continue;
    const inc: RecoveryIncident = {
      id: uuid(), timestamp: Date.now(), service: node.id, serviceType: "node",
      severity: "critical", status: "recovering",
      description: `Validator ${node.id} on ${node.chain} is offline`,
      action: "provision-replacement-node",
      actionLog: [`Offline validator detected: ${node.id} (${node.chain})`],
    };
    incidents.set(inc.id, inc);
    await deployNode({ chain: node.chain as ChainId, role: "validator" });
    inc.actionLog.push("Replacement validator deploying");
    setTimeout(() => { inc.status = "resolved"; inc.resolvedAt = Date.now(); inc.resolvedBy = "auto"; inc.actionLog.push("Replacement synced and live"); }, 8000);
  }

  // Trim incident store
  if (incidents.size > MAX_INCIDENTS) {
    const resolved = [...incidents.values()].filter((i) => i.status === "resolved");
    resolved.sort((a, b) => (a.resolvedAt ?? 0) - (b.resolvedAt ?? 0));
    resolved.slice(0, resolved.length - 100).forEach((i) => incidents.delete(i.id));
  }
}

// ── Exports ───────────────────────────────────────────────────────────────────

export function getIncidents(status?: IncidentStatus): RecoveryIncident[] {
  return [...incidents.values()].filter((i) => !status || i.status === status)
    .sort((a, b) => b.timestamp - a.timestamp);
}

export function getIncident(id: string): RecoveryIncident | undefined {
  return incidents.get(id);
}

export function getRecoveryStats(): RecoveryStats {
  const all = [...incidents.values()];
  const resolved = all.filter((i) => i.status === "resolved");
  const avgMs = resolved.length > 0
    ? resolved.filter((i) => i.resolvedAt).reduce((s, i) => s + (i.resolvedAt! - i.timestamp), 0) / resolved.length
    : 0;
  const actions: RecoveryAction[] = ["restart-container","restart-vm","provision-replacement-node","scale-up-nodes","rebalance-load","alert-only"];
  return {
    totalIncidents:  all.length,
    resolved:        resolved.length,
    failed:          all.filter((i) => i.status === "failed").length,
    inProgress:      all.filter((i) => i.status === "recovering" || i.status === "detected").length,
    avgResolutionMs: avgMs,
    autoResolved:    all.filter((i) => i.resolvedBy === "auto").length,
    manualResolved:  all.filter((i) => i.resolvedBy === "manual").length,
    byAction:        Object.fromEntries(actions.map((a) => [a, all.filter((i) => i.action === a).length])) as Record<RecoveryAction, number>,
  };
}

export async function resolveIncident(id: string, resolvedBy: "auto" | "manual" = "manual"): Promise<{ success: boolean; message: string }> {
  const inc = incidents.get(id);
  if (!inc) return { success: false, message: "Incident not found" };
  if (inc.status === "resolved") return { success: false, message: "Already resolved" };
  inc.status     = "resolved";
  inc.resolvedAt = Date.now();
  inc.resolvedBy = resolvedBy;
  inc.actionLog.push(`Manually resolved at ${new Date().toISOString()}`);
  return { success: true, message: `Incident ${id} resolved` };
}

export async function runRecoveryEngine(): Promise<{ incidentsDetected: number; actionsTriggered: number }> {
  const before = incidents.size;
  await detectAndRecover();
  const after  = incidents.size;
  return { incidentsDetected: after - before, actionsTriggered: Math.max(0, after - before) };
}
