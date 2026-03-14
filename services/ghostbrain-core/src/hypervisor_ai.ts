/**
 * GhostBrain — Hypervisor AI Controller
 *
 * Provides AI-driven intelligence on top of the raw hypervisor controller.
 * Analyses VM fleet health trends, predicts overload conditions, and
 * generates advisory proposals for human-ratified remediation.
 *
 * Raw VM control still goes through:
 *   infra/hypervisor_controller.ts  (low-level libvirt commands)
 *   infra/vm_controller.ts          (snapshot collection)
 *
 * This module is ADVISORY only — it never auto-executes reboot/destroy.
 */

import { request }           from "undici";
import { getVMFleet }        from "./vm_monitor.js";
import { getInfraHistory }   from "./memory/infrastructure_memory.js";
import { store_event }       from "./memory_engine.js";
import { recordCausalChain } from "./blockchain/memory_graph.js";
import { log }               from "./observability/event_logger.js";

// ── Config ────────────────────────────────────────────────────────────────────

const SIGNING_RELAY     = process.env.SIGNING_RELAY_URL       ?? "http://localhost:7910";
const HYPERVISOR_AI_MS  = Number(process.env.HYPERVISOR_AI_MS  ?? "60000");
const CPU_OVERLOAD_PCT  = Number(process.env.HYPERVISOR_CPU_OVERLOAD ?? "88");
const MEM_OVERLOAD_PCT  = Number(process.env.HYPERVISOR_MEM_OVERLOAD ?? "88");
const RESTART_ALERT     = Number(process.env.HYPERVISOR_RESTART_ALERT ?? "3");

// ── Types ─────────────────────────────────────────────────────────────────────

export interface HypervisorAdvisory {
  vmId:      string;
  issue:     string;
  action:    "rebalance_load" | "schedule_restart" | "alert_operator" | "expand_resources";
  rationale: string;
  urgency:   "low" | "medium" | "high" | "critical";
  draftedAt: number;
  submitted: boolean;
}

// ── Internal state ─────────────────────────────────────────────────────────────

const _advisories: HypervisorAdvisory[] = [];
const _lastAdvisory  = new Map<string, number>(); // vmId → last advisory ms
let   _cycleCount    = 0;
let   _timer: ReturnType<typeof setInterval> | null = null;

const COOLDOWN_MS = 10 * 60_000; // 10 min per VM

// ── Analysis loop ─────────────────────────────────────────────────────────────

async function analyseFleet(): Promise<void> {
  _cycleCount++;
  const now  = Date.now();
  const vms  = getVMFleet();

  for (const vm of vms) {
    const last = _lastAdvisory.get(vm.vmId) ?? 0;
    if (now - last < COOLDOWN_MS) continue;

    // Fetch recent history for trend analysis
    const history = getInfraHistory(vm.vmId, "vm", 5 * 60_000); // last 5 min
    if (history.length < 3) continue;

    const avgCpu = history.reduce((s, h) => s + h.cpuPct, 0) / history.length;
    const avgMem = history.reduce((s, h) => s + h.memPct, 0) / history.length;
    const maxRestarts = history.reduce((max, h) => Math.max(max, h.restarts), 0);

    let advisory: HypervisorAdvisory | null = null;

    if (maxRestarts >= RESTART_ALERT) {
      advisory = {
        vmId:      vm.vmId,
        issue:     `VM has restarted ${maxRestarts} times`,
        action:    "alert_operator",
        rationale: `Excessive restarts (${maxRestarts}) detected. Manual investigation required to prevent data corruption.`,
        urgency:   "critical",
        draftedAt: now,
        submitted: false,
      };

      recordCausalChain({
        event:   { label: "vm_excessive_restarts", resourceId: vm.vmId, layer: "vm", payload: { restarts: maxRestarts } },
        cause:   { label: "process_crash_loop" },
        action:  { label: "alert_operator_drafted" },
        outcome: { label: "advisory_pending_ratification", success: true },
      });

    } else if (avgCpu >= CPU_OVERLOAD_PCT) {
      advisory = {
        vmId:      vm.vmId,
        issue:     `CPU sustained at ${avgCpu.toFixed(1)}% over last 5 minutes`,
        action:    "rebalance_load",
        rationale: `VM ${vm.vmId} CPU avg=${avgCpu.toFixed(1)}% exceeds ${CPU_OVERLOAD_PCT}% threshold. Recommend workload rebalancing.`,
        urgency:   "high",
        draftedAt: now,
        submitted: false,
      };
    } else if (avgMem >= MEM_OVERLOAD_PCT) {
      advisory = {
        vmId:      vm.vmId,
        issue:     `Memory sustained at ${avgMem.toFixed(1)}% over last 5 minutes`,
        action:    "expand_resources",
        rationale: `VM ${vm.vmId} memory avg=${avgMem.toFixed(1)}% exceeds ${MEM_OVERLOAD_PCT}% threshold. Recommend memory expansion.`,
        urgency:   avgMem >= 95 ? "critical" : "high",
        draftedAt: now,
        submitted: false,
      };
    } else if (vm.state !== "running") {
      advisory = {
        vmId:      vm.vmId,
        issue:     `VM is not running (state: ${vm.state})`,
        action:    "schedule_restart",
        rationale: `VM ${vm.vmId} is in state "${vm.state}". Advisory restart proposal drafted for human ratification.`,
        urgency:   "high",
        draftedAt: now,
        submitted: false,
      };
    }

    if (advisory) {
      _advisories.push(advisory);
      _lastAdvisory.set(vm.vmId, now);
      await submitAdvisory(advisory);
    }
  }

  if (_cycleCount % 5 === 0) {
    log.debug("hypervisor_ai: cycle", `cycle=${_cycleCount} vms=${vms.length} advisories=${_advisories.length}`);
  }
}

// ── Advisory submission ───────────────────────────────────────────────────────

async function submitAdvisory(advisory: HypervisorAdvisory): Promise<void> {
  store_event({
    resourceId: advisory.vmId,
    layer:      "vm",
    category:   "advisory",
    label:      `hypervisor_ai_${advisory.action}`,
    severity:   advisory.urgency === "critical" ? "critical" : "warning",
    payload:    { issue: advisory.issue, rationale: advisory.rationale, urgency: advisory.urgency },
  });

  try {
    const { statusCode } = await request(`${SIGNING_RELAY}/advisory`, {
      method:  "POST",
      headers: { "content-type": "application/json" },
      body:    JSON.stringify({
        source:    "hypervisor_ai",
        vmId:      advisory.vmId,
        action:    advisory.action,
        issue:     advisory.issue,
        rationale: advisory.rationale,
        urgency:   advisory.urgency,
        ts:        advisory.draftedAt,
      }),
    });

    advisory.submitted = statusCode >= 200 && statusCode < 300;
    log.info("hypervisor_ai: advisory_submitted", `${advisory.action} for ${advisory.vmId} urgency=${advisory.urgency}`);
  } catch (err) {
    log.warn("hypervisor_ai: relay_unreachable", String(err));
  }
}

// ── Public API ────────────────────────────────────────────────────────────────

export function getHypervisorAdvisories(): HypervisorAdvisory[] {
  return [..._advisories];
}

export function getHypervisorAIStats() {
  return {
    cycleCount:       _cycleCount,
    intervalMs:       HYPERVISOR_AI_MS,
    totalAdvisories:  _advisories.length,
    pendingAdvisories: _advisories.filter(a => !a.submitted).length,
    byUrgency: {
      critical: _advisories.filter(a => a.urgency === "critical").length,
      high:     _advisories.filter(a => a.urgency === "high").length,
      medium:   _advisories.filter(a => a.urgency === "medium").length,
      low:      _advisories.filter(a => a.urgency === "low").length,
    },
  };
}

// ── Lifecycle ─────────────────────────────────────────────────────────────────

export function startHypervisorAI(): void {
  if (_timer) return;
  void analyseFleet();
  _timer = setInterval(() => void analyseFleet(), HYPERVISOR_AI_MS);
  log.info("hypervisor_ai: started", `intervalMs=${HYPERVISOR_AI_MS}`);
}

export function stopHypervisorAI(): void {
  if (_timer) { clearInterval(_timer); _timer = null; }
  log.info("hypervisor_ai: stopped", "hypervisor AI halted");
}
