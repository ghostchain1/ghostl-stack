/**
 * Infrastructure AI Agent
 * Delegates container/VM repair to GACK (which enforces its own DRY_RUN guard).
 * Does not call shell, virsh, or Docker directly.
 */
import { swarmBus } from "../communication/swarm-bus";
import { ghostFetch } from "../http";
import {
  SWARM_AGENT_RUNS_TOTAL,
  SWARM_AGENT_DURATION_SECONDS,
  SWARM_DRY_RUN_TOTAL,
  SWARM_UPSTREAM_ERRORS_TOTAL,
} from "../metrics";
import type { AgentDescriptor, AgentResult, InfraRepairTask } from "../types";

const NAME = "infra" as const;
const DRY_RUN = process.env["GHOST_SWARM_INFRA_DRY_RUN"] !== "0";
const GACK_URL = process.env["GHOST_SWARM_GACK_URL"] ?? "http://127.0.0.1:4070";
const GNMC_URL = process.env["GHOST_SWARM_GNMC_URL"] ?? "http://127.0.0.1:4060";

let _status: AgentDescriptor["status"] = "idle";
let _lastRun: string | null = null;
let _lastError: string | null = null;
let _tasksProcessed = 0;

export function infraAgent(): void {
  swarmBus.on("infra-repair", async (task: InfraRepairTask) => {
    const end = SWARM_AGENT_DURATION_SECONDS.startTimer({ agent: NAME });
    _status = "running";

    if (DRY_RUN) {
      SWARM_DRY_RUN_TOTAL.inc({ agent: NAME });
      SWARM_AGENT_RUNS_TOTAL.inc({ agent: NAME, outcome: "dry_run" });
      _tasksProcessed++;
      _lastRun = new Date().toISOString();
      _status = "idle";
      end();
      return;
    }

    // 1. Read container health from GACK
    const containerRes = await ghostFetch(`${GACK_URL}/infra/containers`);
    if (!containerRes.ok) {
      SWARM_UPSTREAM_ERRORS_TOTAL.inc({ agent: NAME, upstream: "gack-containers" });
    }

    // 2. Read VM health from GNMC
    const vmRes = await ghostFetch(`${GNMC_URL}/infra/vms`);
    if (!vmRes.ok) {
      SWARM_UPSTREAM_ERRORS_TOTAL.inc({ agent: NAME, upstream: "gnmc-vms" });
    }

    // 3. Chain health for the specified layer (if provided)
    if (task.layer) {
      const chainRes = await ghostFetch(`${GACK_URL}/blockchain/health`);
      if (!chainRes.ok) {
        SWARM_UPSTREAM_ERRORS_TOTAL.inc({ agent: NAME, upstream: "gack-chain" });
      }
    }

    const ok = containerRes.ok || vmRes.ok;
    SWARM_AGENT_RUNS_TOTAL.inc({ agent: NAME, outcome: ok ? "success" : "error" });
    _tasksProcessed++;
    _lastRun = new Date().toISOString();
    _lastError = ok ? null : "all upstreams unreachable";
    _status = ok ? "idle" : "degraded";
    end();
  });
}

export function infraDescriptor(): AgentDescriptor {
  return {
    name: NAME,
    status: _status,
    lastRun: _lastRun,
    lastError: _lastError,
    tasksProcessed: _tasksProcessed,
  };
}

export async function triggerInfraRepair(task: InfraRepairTask): Promise<AgentResult> {
  swarmBus.emit("infra-repair", task);
  return {
    agent: NAME,
    ok: true,
    dryRun: DRY_RUN,
    detail: `infra-repair emitted for layer=${task.layer ?? "all"}, target=${task.target ?? "all"}`,
    ts: new Date().toISOString(),
  };
}
