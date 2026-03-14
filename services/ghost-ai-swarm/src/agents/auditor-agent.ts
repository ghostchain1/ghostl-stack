/**
 * Auditor AI Agent
 * Queries GhostBrain for vulnerability signals.
 * Results are READ-ONLY — never writes to the filesystem or runs forge directly.
 */
import { swarmBus } from "../communication/swarm-bus";
import { ghostFetch } from "../http";
import {
  SWARM_AGENT_RUNS_TOTAL,
  SWARM_AGENT_DURATION_SECONDS,
  SWARM_DRY_RUN_TOTAL,
  SWARM_UPSTREAM_ERRORS_TOTAL,
} from "../metrics";
import type { AgentDescriptor, AgentResult, AuditTask } from "../types";

const NAME = "auditor" as const;
const DRY_RUN = process.env["GHOST_SWARM_AUDITOR_DRY_RUN"] !== "0";
const BRAIN_URL = process.env["GHOST_SWARM_BRAIN_URL"] ?? "http://127.0.0.1:7900";

let _status: AgentDescriptor["status"] = "idle";
let _lastRun: string | null = null;
let _lastError: string | null = null;
let _tasksProcessed = 0;

export function auditorAgent(): void {
  swarmBus.on("audit-code", async (task: AuditTask) => {
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

    // Query GhostBrain for security analysis (read-only)
    const res = await ghostFetch(`${BRAIN_URL}/classify`, {
      method: "POST",
      body: { kind: "security-scan", target: task.target, deep: task.deep ?? false },
    });

    if (!res.ok) {
      SWARM_UPSTREAM_ERRORS_TOTAL.inc({ agent: NAME, upstream: "ghostbrain" });
    }

    SWARM_AGENT_RUNS_TOTAL.inc({ agent: NAME, outcome: res.ok ? "success" : "error" });
    _tasksProcessed++;
    _lastRun = new Date().toISOString();
    _lastError = res.ok ? null : "ghostbrain unreachable";
    _status = res.ok ? "idle" : "degraded";
    end();
  });
}

export function auditorDescriptor(): AgentDescriptor {
  return {
    name: NAME,
    status: _status,
    lastRun: _lastRun,
    lastError: _lastError,
    tasksProcessed: _tasksProcessed,
  };
}

export async function triggerAudit(task: AuditTask): Promise<AgentResult> {
  swarmBus.emit("audit-code", task);
  return {
    agent: NAME,
    ok: true,
    dryRun: DRY_RUN,
    detail: `audit-code emitted for target=${task.target}`,
    ts: new Date().toISOString(),
  };
}
