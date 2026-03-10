/**
 * Treasury AI Agent
 * Reads treasury-engine metrics and submits advisory reports to GhostBrain.
 * Write operations (rebalance) are proposal-only via signing relay.
 */
import { swarmBus } from "../communication/swarm-bus";
import { ghostFetch } from "../http";
import {
  SWARM_AGENT_RUNS_TOTAL,
  SWARM_AGENT_DURATION_SECONDS,
  SWARM_DRY_RUN_TOTAL,
  SWARM_UPSTREAM_ERRORS_TOTAL,
} from "../metrics";
import type { AgentDescriptor, AgentResult, TreasuryTask } from "../types";

const NAME = "treasury" as const;
const DRY_RUN = process.env["GHOST_SWARM_TREASURY_DRY_RUN"] !== "0";
const TREASURY_URL = process.env["GHOST_SWARM_TREASURY_URL"] ?? "http://127.0.0.1:7683";
const RELAY_URL    = process.env["GHOST_SWARM_SIGNING_RELAY_URL"] ?? "http://127.0.0.1:7910";
const BRAIN_URL    = process.env["GHOST_SWARM_BRAIN_URL"] ?? "http://127.0.0.1:7900";

let _status: AgentDescriptor["status"] = "idle";
let _lastRun: string | null = null;
let _lastError: string | null = null;
let _tasksProcessed = 0;

export function treasuryAgent(): void {
  swarmBus.on("treasury-action", async (task: TreasuryTask) => {
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

    // 1. Read treasury state (read-only)
    const treasuryRes = await ghostFetch(`${TREASURY_URL}/health`);
    if (!treasuryRes.ok) {
      SWARM_UPSTREAM_ERRORS_TOTAL.inc({ agent: NAME, upstream: "treasury-engine" });
    }

    // 2. Forward to GhostBrain for advisory
    const brainRes = await ghostFetch(`${BRAIN_URL}/classify`, {
      method: "POST",
      body: { kind: "treasury-advisory", action: task.action, state: treasuryRes.body },
    });
    if (!brainRes.ok) {
      SWARM_UPSTREAM_ERRORS_TOTAL.inc({ agent: NAME, upstream: "ghostbrain" });
    }

    // 3. For rebalance: proposal-only via signing relay
    if (task.action === "rebalance") {
      const relayRes = await ghostFetch(`${RELAY_URL}/proposals`, {
        method: "POST",
        body: {
          source: "ghost-ai-swarm/treasury-agent",
          kind: "treasury-rebalance",
          token: task.token ?? "GST",
          advisory: brainRes.ok ? brainRes.body : null,
          requiresHumanRatification: true,
        },
      });
      if (!relayRes.ok) {
        SWARM_UPSTREAM_ERRORS_TOTAL.inc({ agent: NAME, upstream: "signing-relay" });
      }
    }

    const ok = treasuryRes.ok || brainRes.ok;
    SWARM_AGENT_RUNS_TOTAL.inc({ agent: NAME, outcome: ok ? "success" : "error" });
    _tasksProcessed++;
    _lastRun = new Date().toISOString();
    _lastError = ok ? null : "treasury-engine + ghostbrain both unreachable";
    _status = ok ? "idle" : "degraded";
    end();
  });
}

export function treasuryDescriptor(): AgentDescriptor {
  return {
    name: NAME,
    status: _status,
    lastRun: _lastRun,
    lastError: _lastError,
    tasksProcessed: _tasksProcessed,
  };
}

export async function triggerTreasury(task: TreasuryTask): Promise<AgentResult> {
  swarmBus.emit("treasury-action", task);
  return {
    agent: NAME,
    ok: true,
    dryRun: DRY_RUN,
    detail: `treasury-action [${task.action}] emitted`,
    ts: new Date().toISOString(),
  };
}
