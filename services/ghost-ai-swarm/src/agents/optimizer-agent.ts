/**
 * Optimizer AI Agent
 * Reads the GACK AI decision endpoint and emits tuning suggestions.
 * Never modifies system config autonomously — suggestions go to GhostBrain.
 */
import { swarmBus } from "../communication/swarm-bus";
import { ghostFetch } from "../http";
import {
  SWARM_AGENT_RUNS_TOTAL,
  SWARM_AGENT_DURATION_SECONDS,
  SWARM_DRY_RUN_TOTAL,
  SWARM_UPSTREAM_ERRORS_TOTAL,
} from "../metrics";
import type { AgentDescriptor, AgentResult, OptimizeTask } from "../types";

const NAME = "optimizer" as const;
const DRY_RUN = process.env["GHOST_SWARM_OPTIMIZER_DRY_RUN"] !== "0";
const GACK_URL = process.env["GHOST_SWARM_GACK_URL"] ?? "http://127.0.0.1:4070";
const BRAIN_URL = process.env["GHOST_SWARM_BRAIN_URL"] ?? "http://127.0.0.1:7900";

let _status: AgentDescriptor["status"] = "idle";
let _lastRun: string | null = null;
let _lastError: string | null = null;
let _tasksProcessed = 0;

export function optimizerAgent(): void {
  swarmBus.on("optimize-system", async (_task: OptimizeTask) => {
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

    // 1. Read GACK AI decision (health score + recommendation)
    const [decisionRes, telemetryRes] = await Promise.all([
      ghostFetch(`${GACK_URL}/ai/decision`),
      ghostFetch(`${GACK_URL}/telemetry`),
    ]);

    if (!decisionRes.ok) {
      SWARM_UPSTREAM_ERRORS_TOTAL.inc({ agent: NAME, upstream: "gack" });
    }
    if (!telemetryRes.ok) {
      SWARM_UPSTREAM_ERRORS_TOTAL.inc({ agent: NAME, upstream: "gack-telemetry" });
    }

    // 2. Forward to GhostBrain for optimization advisory (read-only upstream)
    if (decisionRes.ok) {
      const brainRes = await ghostFetch(`${BRAIN_URL}/classify`, {
        method: "POST",
        body: { kind: "optimize-advisory", decision: decisionRes.body },
      });
      if (!brainRes.ok) {
        SWARM_UPSTREAM_ERRORS_TOTAL.inc({ agent: NAME, upstream: "ghostbrain" });
      }
    }

    const ok = decisionRes.ok || telemetryRes.ok;
    SWARM_AGENT_RUNS_TOTAL.inc({ agent: NAME, outcome: ok ? "success" : "error" });
    _tasksProcessed++;
    _lastRun = new Date().toISOString();
    _lastError = ok ? null : "GACK unreachable";
    _status = ok ? "idle" : "degraded";
    end();
  });
}

export function optimizerDescriptor(): AgentDescriptor {
  return {
    name: NAME,
    status: _status,
    lastRun: _lastRun,
    lastError: _lastError,
    tasksProcessed: _tasksProcessed,
  };
}

export async function triggerOptimize(task: OptimizeTask): Promise<AgentResult> {
  swarmBus.emit("optimize-system", task);
  return {
    agent: NAME,
    ok: true,
    dryRun: DRY_RUN,
    detail: `optimize-system emitted`,
    ts: new Date().toISOString(),
  };
}
