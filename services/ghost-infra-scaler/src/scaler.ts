/**
 * Infra Scaler — dispatches ScalingDecisions to ghost-ai-swarm-v2.
 * Auto-execute only when SCALER_AUTO_EXECUTE=true.
 */
import { fetch } from "undici";
import { type ScalingDecision, markExecuted } from "./healthMonitor.js";

const SWARM_URL = process.env.SWARM_URL ?? "http://localhost:7970";
const AUTO_EXECUTE = process.env.SCALER_AUTO_EXECUTE === "true";
const DISPATCH_TIMEOUT_MS = 8_000;

const ROLE_MAP: Record<string, string> = {
  "deploy-node": "infra",
  "restart-node": "node",
  "scale-service": "infra",
  rebalance: "network",
};

const TYPE_MAP: Record<string, string> = {
  "deploy-node": "provision-vm",
  "restart-node": "restart-node",
  "scale-service": "scale-service",
  rebalance: "sync-layers",
};

async function dispatchToSwarm(decision: ScalingDecision): Promise<boolean> {
  try {
    const res = await fetch(`${SWARM_URL}/tasks`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        targetRole: ROLE_MAP[decision.action] ?? "infra",
        type: TYPE_MAP[decision.action] ?? decision.action,
        payload: {
          region: decision.region,
          nodeId: decision.nodeId,
          role: decision.role,
          reason: decision.reason,
        },
        humanApprovalRequired: decision.humanApprovalRequired,
      }),
      signal: AbortSignal.timeout(DISPATCH_TIMEOUT_MS),
    });
    return res.ok;
  } catch {
    return false;
  }
}

export async function executeDecision(decision: ScalingDecision, forceDryRun = false): Promise<{
  ok: boolean;
  dispatched: boolean;
  dryRun: boolean;
}> {
  const dryRun = forceDryRun || decision.dryRun || !AUTO_EXECUTE;

  if (dryRun) {
    return { ok: true, dispatched: false, dryRun: true };
  }

  const dispatched = await dispatchToSwarm(decision);
  if (dispatched) {
    markExecuted(decision.id);
  }

  return { ok: dispatched, dispatched, dryRun: false };
}

export async function executePending(dryRun?: boolean): Promise<{
  total: number;
  executed: number;
  failed: number;
}> {
  const { getPendingDecisions } = await import("./healthMonitor.js");
  const pending = getPendingDecisions();
  let executed = 0;
  let failed = 0;

  for (const decision of pending) {
    const result = await executeDecision(decision, dryRun);
    if (result.ok) executed++;
    else failed++;
  }

  return { total: pending.length, executed, failed };
}
