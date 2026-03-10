/**
 * Governance AI Agent
 * Drafts governance proposals and sends them to the signing relay.
 * NEVER executes on-chain autonomously — proposal-only model.
 * Humans must ratify via governance quorum.
 */
import { swarmBus } from "../communication/swarm-bus";
import { ghostFetch } from "../http";
import {
  SWARM_AGENT_RUNS_TOTAL,
  SWARM_AGENT_DURATION_SECONDS,
  SWARM_DRY_RUN_TOTAL,
  SWARM_UPSTREAM_ERRORS_TOTAL,
} from "../metrics";
import type { AgentDescriptor, AgentResult, GovernanceTask } from "../types";

const NAME = "governance" as const;
const DRY_RUN = process.env["GHOST_SWARM_GOVERNANCE_DRY_RUN"] !== "0";
const RELAY_URL = process.env["GHOST_SWARM_SIGNING_RELAY_URL"] ?? "http://127.0.0.1:7910";
const BRAIN_URL = process.env["GHOST_SWARM_BRAIN_URL"] ?? "http://127.0.0.1:7900";

let _status: AgentDescriptor["status"] = "idle";
let _lastRun: string | null = null;
let _lastError: string | null = null;
let _tasksProcessed = 0;

export function governanceAgent(): void {
  swarmBus.on("governance-action", async (task: GovernanceTask) => {
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

    // 1. Get GhostBrain advisory for the proposal
    const brainRes = await ghostFetch(`${BRAIN_URL}/classify`, {
      method: "POST",
      body: { kind: "governance-draft", proposalKind: task.kind },
    });
    if (!brainRes.ok) {
      SWARM_UPSTREAM_ERRORS_TOTAL.inc({ agent: NAME, upstream: "ghostbrain" });
    }

    // 2. Submit proposal to signing relay — NEVER execute inline
    const relayRes = await ghostFetch(`${RELAY_URL}/proposals`, {
      method: "POST",
      body: {
        source: "ghost-ai-swarm/governance-agent",
        kind: task.kind,
        payload: task.payload,
        brainAdvisory: brainRes.ok ? brainRes.body : null,
        requiresHumanRatification: true,
      },
    });
    if (!relayRes.ok) {
      SWARM_UPSTREAM_ERRORS_TOTAL.inc({ agent: NAME, upstream: "signing-relay" });
    }

    const ok = relayRes.ok;
    SWARM_AGENT_RUNS_TOTAL.inc({ agent: NAME, outcome: ok ? "success" : "error" });
    _tasksProcessed++;
    _lastRun = new Date().toISOString();
    _lastError = ok ? null : "signing relay unreachable";
    _status = ok ? "idle" : "degraded";
    end();
  });
}

export function governanceDescriptor(): AgentDescriptor {
  return {
    name: NAME,
    status: _status,
    lastRun: _lastRun,
    lastError: _lastError,
    tasksProcessed: _tasksProcessed,
  };
}

export async function triggerGovernance(task: GovernanceTask): Promise<AgentResult> {
  swarmBus.emit("governance-action", task);
  return {
    agent: NAME,
    ok: true,
    dryRun: DRY_RUN,
    detail: `governance-action [${task.kind}] emitted — requires human ratification`,
    ts: new Date().toISOString(),
  };
}
