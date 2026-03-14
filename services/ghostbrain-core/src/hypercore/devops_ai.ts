/**
 * GhostBrain HyperCore — DevOps AI
 *
 * Analyzes the entire infrastructure fleet (VMs, containers, services) and
 * generates ranked improvement recommendations enriched with LLM insight context.
 *
 * Capabilities:
 *   • Detect containers / VMs under resource pressure
 *   • Propose scaling, restart, or rebalance actions
 *   • Generate config improvement hints from cross-fleet patterns
 *   • Prioritise interventions by urgency and estimated impact
 *
 * Safety: improvements flagged autonomous=false require governance ratification
 * before execution (VM restarts, quorum-sensitive changes, security lockdowns).
 *
 * Prometheus metrics:
 *   ghostbrain_hypercore_devops_cycles_total
 *   ghostbrain_hypercore_devops_suggestions_total
 *   ghostbrain_hypercore_devops_autonomous_total
 *   ghostbrain_hypercore_devops_critical_total
 */

import { randomUUID }                                from "node:crypto";
import { getVMFleet, getUnhealthyVMs }               from "../vm_monitor.js";
import { getContainerFleet, getUnhealthyContainers } from "../docker_monitor.js";
import { getInfraHistory }                           from "../memory/infrastructure_memory.js";
import { inc }                                       from "../observability/metrics_exporter.js";
import { log }                                       from "../observability/event_logger.js";
import type { SystemInsight }                        from "./llm_reasoner.js";

// ── Types ─────────────────────────────────────────────────────────────────────

export type ImprovementCategory = "container" | "vm" | "service" | "config" | "scaling";
export type ImprovementPriority = "low" | "medium" | "high" | "critical";

export interface Improvement {
  id:              string;
  ts:              number;
  category:        ImprovementCategory;
  priority:        ImprovementPriority;
  resourceId:      string;
  title:           string;
  description:     string;
  /** Normalised action name that maps to a JobType */
  action:          string;
  params:          Record<string, unknown>;
  estimatedImpact: string;
  /** true = can execute autonomously; false = must await governance */
  autonomous:      boolean;
}

// ── State ─────────────────────────────────────────────────────────────────────

const _history: Improvement[] = [];
const MAX_HISTORY              = 500;
let   _cycles                  = 0;

function push(imp: Improvement): void {
  _history.push(imp);
  if (_history.length > MAX_HISTORY) _history.shift();
}

// ── Engine ────────────────────────────────────────────────────────────────────

export class DevOpsAI {

  /**
   * Generate infrastructure improvement recommendations.
   * Incorporates LLMReasoner insights for richer cross-domain context.
   */
  suggest(insights: SystemInsight[]): Improvement[] {
    _cycles++;
    inc("ghostbrain_hypercore_devops_cycles_total", "DevOps AI suggestion cycles");

    const improvements: Improvement[] = [];

    try {
      // ── Container analysis ────────────────────────────────────────────────
      const allContainers       = getContainerFleet();
      const unhealthyContainers = getUnhealthyContainers();

      for (const c of unhealthyContainers) {
        const h   = getInfraHistory(c.id, "container", 300_000);
        const cpu = h.length ? h.reduce((s, e) => s + e.cpuPct, 0) / h.length : c.cpuPct;
        const mem = h.length ? h.reduce((s, e) => s + e.memPct, 0) / h.length : c.memPct;

        if (c.restarts >= 5) {
          const imp: Improvement = {
            id:              randomUUID(),
            ts:              Date.now(),
            category:        "container",
            priority:        c.restarts >= 10 ? "critical" : "high",
            resourceId:      c.id,
            title:           `Crash loop: ${c.name} (${c.restarts} restarts)`,
            description:     `Container has restarted ${c.restarts} times — likely an OOM kill or config crash loop.`,
            action:          "restart_container",
            params:          { containerId: c.id, containerName: c.name, increaseMemoryMB: 512 },
            estimatedImpact: "Stops crash loop and restores service availability",
            autonomous:      c.restarts < 10,
          };
          improvements.push(imp);
          push(imp);
        } else if (mem > 90) {
          const imp: Improvement = {
            id:              randomUUID(),
            ts:              Date.now(),
            category:        "scaling",
            priority:        mem > 98 ? "critical" : "high",
            resourceId:      c.id,
            title:           `Memory saturation: ${c.name} (${mem.toFixed(0)}%)`,
            description:     `Container memory at ${mem.toFixed(0)}% — risk of OOM kill.`,
            action:          "scale_memory",
            params:          { containerId: c.id, containerName: c.name, increaseMemoryMB: 256 },
            estimatedImpact: "Prevents OOM kill and improves throughput",
            autonomous:      true,
          };
          improvements.push(imp);
          push(imp);
        } else if (cpu > 90) {
          const imp: Improvement = {
            id:              randomUUID(),
            ts:              Date.now(),
            category:        "scaling",
            priority:        "high",
            resourceId:      c.id,
            title:           `CPU saturation: ${c.name} (${cpu.toFixed(0)}%)`,
            description:     `Container CPU at ${cpu.toFixed(0)}% — response latencies will degrade.`,
            action:          "scale_cpu",
            params:          { containerId: c.id, containerName: c.name, increaseMillicores: 500 },
            estimatedImpact: "Reduces latency and prevents cascading failure",
            autonomous:      true,
          };
          improvements.push(imp);
          push(imp);
        }
      }

      // ── VM analysis ───────────────────────────────────────────────────────
      for (const vm of getUnhealthyVMs()) {
        const h   = getInfraHistory(vm.vmId, "vm", 300_000);
        const cpu = h.length ? h.reduce((s, e) => s + e.cpuPct, 0) / h.length : vm.cpuPct;
        const mem = h.length ? h.reduce((s, e) => s + e.memPct, 0) / h.length : vm.memPct;

        if (vm.state === "error") {
          const imp: Improvement = {
            id:              randomUUID(),
            ts:              Date.now(),
            category:        "vm",
            priority:        "critical",
            resourceId:      vm.vmId,
            title:           `VM in error state: ${vm.vmName}`,
            description:     `VM ${vm.vmName} is in state=error. Manual investigation required.`,
            action:          "restart_vm",
            params:          { vmId: vm.vmId, vmName: vm.vmName, createSnapshot: true },
            estimatedImpact: "Restores VM to running state; snapshot preserves data",
            autonomous:      false,  // VM restarts always need governance
          };
          improvements.push(imp);
          push(imp);
        } else if (cpu > 88 || mem > 88) {
          const imp: Improvement = {
            id:              randomUUID(),
            ts:              Date.now(),
            category:        "vm",
            priority:        "high",
            resourceId:      vm.vmId,
            title:           `VM resource pressure: ${vm.vmName} (cpu=${cpu.toFixed(0)}% mem=${mem.toFixed(0)}%)`,
            description:     `VM is approaching saturation. Rebalancing workloads will prevent cascading failure.`,
            action:          "rebalance_load",
            params:          { vmId: vm.vmId, vmName: vm.vmName, migrateContainers: true },
            estimatedImpact: "Distributes load and prevents VM failure",
            autonomous:      true,
          };
          improvements.push(imp);
          push(imp);
        }
      }

      // ── LLM security insights → config hardening ──────────────────────────
      for (const si of insights.filter(i => i.domain === "security" && i.severity === "critical")) {
        const imp: Improvement = {
          id:              randomUUID(),
          ts:              Date.now(),
          category:        "config",
          priority:        "critical",
          resourceId:      "system",
          title:           `Security hardening required: ${si.finding}`,
          description:     si.suggestion,
          action:          "security_lockdown",
          params:          { finding: si.finding, rootCause: si.rootCause, evidence: si.evidence },
          estimatedImpact: "Reduces attack surface and mitigates active threat",
          autonomous:      false,
        };
        improvements.push(imp);
        push(imp);
      }

      // ── Fleet-wide restart rate heuristic ─────────────────────────────────
      const highRestartCount = allContainers.filter(c => c.restarts > 3).length;
      if (allContainers.length > 0 && highRestartCount > allContainers.length * 0.3) {
        const imp: Improvement = {
          id:              randomUUID(),
          ts:              Date.now(),
          category:        "config",
          priority:        "high",
          resourceId:      "fleet",
          title:           `Fleet-wide restart elevation: ${highRestartCount}/${allContainers.length} containers`,
          description:     "More than 30% of containers have ≥4 restarts — likely a systemic issue (OOM pressure, image bug, or config drift).",
          action:          "fleet_health_review",
          params:          { affectedCount: highRestartCount, totalCount: allContainers.length },
          estimatedImpact: "Identifies root cause and stops fleet-wide crash loop",
          autonomous:      false,
        };
        improvements.push(imp);
        push(imp);
      }

    } catch (err) {
      log.error("hypercore.devops_ai", `suggest error: ${String(err)}`);
    }

    inc("ghostbrain_hypercore_devops_suggestions_total", "Total improvement suggestions from DevOps AI", improvements.length);
    inc("ghostbrain_hypercore_devops_autonomous_total",  "Autonomous improvement suggestions", improvements.filter(i => i.autonomous).length);
    inc("ghostbrain_hypercore_devops_critical_total",    "Critical improvement suggestions", improvements.filter(i => i.priority === "critical").length);

    return improvements;
  }

  getHistory(n = 50): Improvement[] {
    return _history.slice(-n);
  }

  stats() {
    return {
      cycles:           _cycles,
      totalSuggested:   _history.length,
      autonomousCount:  _history.filter(i => i.autonomous).length,
      criticalCount:    _history.filter(i => i.priority === "critical").length,
      latestTs:         _history.at(-1)?.ts ?? null,
    };
  }
}

export const devopsAI = new DevOpsAI();
