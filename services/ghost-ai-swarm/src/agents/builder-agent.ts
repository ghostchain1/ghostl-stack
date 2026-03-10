/**
 * Builder AI Agent
 * Triggers code-build workflows by calling GACK then GhostBrain.
 * DRY_RUN=1 by default — in dry mode no writes are dispatched.
 */
import { swarmBus } from "../communication/swarm-bus";
import { ghostFetch } from "../http";
import {
  SWARM_AGENT_RUNS_TOTAL,
  SWARM_AGENT_DURATION_SECONDS,
  SWARM_DRY_RUN_TOTAL,
  SWARM_UPSTREAM_ERRORS_TOTAL,
} from "../metrics";
import type { AgentDescriptor, AgentResult, BuildTask } from "../types";

const NAME = "builder" as const;
const DRY_RUN = process.env["GHOST_SWARM_BUILDER_DRY_RUN"] !== "0";
const GACK_URL = process.env["GHOST_SWARM_GACK_URL"] ?? "http://127.0.0.1:4070";
const BRAIN_URL = process.env["GHOST_SWARM_BRAIN_URL"] ?? "http://127.0.0.1:7900";

let _status: AgentDescriptor["status"] = "idle";
let _lastRun: string | null = null;
let _lastError: string | null = null;
let _tasksProcessed = 0;

export function builderAgent(): void {
  swarmBus.on("build-code", async (task: BuildTask) => {
    const end = SWARM_AGENT_DURATION_SECONDS.startTimer({ agent: NAME });
    _status = "running";

    if (DRY_RUN || task.dryRun) {
      SWARM_DRY_RUN_TOTAL.inc({ agent: NAME });
      SWARM_AGENT_RUNS_TOTAL.inc({ agent: NAME, outcome: "dry_run" });
      _tasksProcessed++;
      _lastRun = new Date().toISOString();
      _status = "idle";
      end();
      return;
    }

    // 1. Ask GhostBrain for build analysis (read-only)
    const brainRes = await ghostFetch(`${BRAIN_URL}/classify`, {
      method: "POST",
      body: { kind: "build-request", target: task.target },
    });
    if (!brainRes.ok) {
      SWARM_UPSTREAM_ERRORS_TOTAL.inc({ agent: NAME, upstream: "ghostbrain" });
    }

    // 2. Trigger GACK kernel run (read-only diagnostic)
    const gackRes = await ghostFetch(`${GACK_URL}/status`);
    if (!gackRes.ok) {
      SWARM_UPSTREAM_ERRORS_TOTAL.inc({ agent: NAME, upstream: "gack" });
    }

    const ok = brainRes.ok || gackRes.ok;
    SWARM_AGENT_RUNS_TOTAL.inc({ agent: NAME, outcome: ok ? "success" : "error" });
    _tasksProcessed++;
    _lastRun = new Date().toISOString();
    _lastError = ok ? null : "upstream error — see logs";
    _status = ok ? "idle" : "degraded";
    end();
  });
}

export function builderDescriptor(): AgentDescriptor {
  return {
    name: NAME,
    status: _status,
    lastRun: _lastRun,
    lastError: _lastError,
    tasksProcessed: _tasksProcessed,
  };
}

export async function triggerBuild(task: BuildTask): Promise<AgentResult> {
  swarmBus.emit("build-code", task);
  return {
    agent: NAME,
    ok: true,
    dryRun: DRY_RUN || (task.dryRun ?? false),
    detail: `build-code emitted for target=${task.target}`,
    ts: new Date().toISOString(),
  };
}
