/**
 * Defender AI Agent
 * Responds to security alerts by querying GNMC + GACK threat APIs.
 * Write operations (container isolate, etc.) require DRY_RUN=0 explicitly.
 */
import { swarmBus } from "../communication/swarm-bus";
import { ghostFetch } from "../http";
import {
  SWARM_AGENT_RUNS_TOTAL,
  SWARM_AGENT_DURATION_SECONDS,
  SWARM_DRY_RUN_TOTAL,
  SWARM_UPSTREAM_ERRORS_TOTAL,
} from "../metrics";
import type { AgentDescriptor, AgentResult, SecurityAlert } from "../types";

const NAME = "defender" as const;
const DRY_RUN = process.env["GHOST_SWARM_DEFENDER_DRY_RUN"] !== "0";
const GNMC_URL = process.env["GHOST_SWARM_GNMC_URL"] ?? "http://127.0.0.1:4060";
const GACK_URL = process.env["GHOST_SWARM_GACK_URL"] ?? "http://127.0.0.1:4070";
const BRAIN_URL = process.env["GHOST_SWARM_BRAIN_URL"] ?? "http://127.0.0.1:7900";

let _status: AgentDescriptor["status"] = "idle";
let _lastRun: string | null = null;
let _lastError: string | null = null;
let _tasksProcessed = 0;

export function defenderAgent(): void {
  swarmBus.on("security-alert", async (alert: SecurityAlert) => {
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

    // 1. Classify the alert via GhostBrain (read-only)
    const brainRes = await ghostFetch(`${BRAIN_URL}/classify`, {
      method: "POST",
      body: { kind: "security-alert", severity: alert.severity, source: alert.source },
    });
    if (!brainRes.ok) {
      SWARM_UPSTREAM_ERRORS_TOTAL.inc({ agent: NAME, upstream: "ghostbrain" });
    }

    // 2. For HIGH/CRITICAL: query GNMC health to assess containment needs
    if (alert.severity === "high" || alert.severity === "critical") {
      const gnmcRes = await ghostFetch(`${GNMC_URL}/monitoring/health`);
      if (!gnmcRes.ok) {
        SWARM_UPSTREAM_ERRORS_TOTAL.inc({ agent: NAME, upstream: "gnmc" });
      }
      // Check chain routing for potential L3→L1 bypass attacks
      const gackRes = await ghostFetch(`${GACK_URL}/network/routing-table`);
      if (!gackRes.ok) {
        SWARM_UPSTREAM_ERRORS_TOTAL.inc({ agent: NAME, upstream: "gack" });
      }
    }

    const ok = brainRes.ok;
    SWARM_AGENT_RUNS_TOTAL.inc({ agent: NAME, outcome: ok ? "success" : "error" });
    _tasksProcessed++;
    _lastRun = new Date().toISOString();
    _lastError = ok ? null : "upstream error — see logs";
    _status = ok ? "idle" : "degraded";
    end();
  });
}

export function defenderDescriptor(): AgentDescriptor {
  return {
    name: NAME,
    status: _status,
    lastRun: _lastRun,
    lastError: _lastError,
    tasksProcessed: _tasksProcessed,
  };
}

export async function triggerDefend(alert: SecurityAlert): Promise<AgentResult> {
  swarmBus.emit("security-alert", alert);
  return {
    agent: NAME,
    ok: true,
    dryRun: DRY_RUN,
    detail: `security-alert [${alert.severity}] from ${alert.source} dispatched`,
    ts: new Date().toISOString(),
  };
}
