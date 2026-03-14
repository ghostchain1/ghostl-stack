/**
 * Infrastructure Agent — monitors load, scales nodes, auto-repairs.
 * Linked to: Autonomous Infrastructure Engine (AIE) port 9975
 */

import logger from "../utils/logger";
import { updateAgentStatus, recordDecision } from "../registry/agentRegistry";
import { sendMessage } from "../communication/agentBus";

const ID = "infrastructure-agent";
const rand = (a: number, b: number) => Math.random() * (b - a) + a;
const pick  = <T>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)]!;

// Simulated ecosystem state
let currentLoad    = 62;      // % CPU/bandwidth load across cluster
let nodeCount      = 14;
let repairQueue    = 0;

function getNetworkLoad(): number {
  currentLoad = Math.max(20, Math.min(98, currentLoad + rand(-8, 8)));
  return currentLoad;
}

function assessRepairQueue(): number {
  repairQueue = Math.random() < 0.2 ? Math.floor(rand(1, 3)) : 0;
  return repairQueue;
}

type InfraDecision = { action: string; reasoning: string; impact: "low" | "medium" | "high" | "critical"; outcome: string; notify?: { to: string; subject: string; content: string } };

function decide(load: number, repairs: number): InfraDecision {
  if (load > 90) {
    const newNodes = 2;
    nodeCount += newNodes;
    return {
      action:    "Emergency node scale-up",
      reasoning: `Network load critically high at ${load.toFixed(1)}% — above emergency threshold (90%)`,
      impact:    "critical",
      outcome:   `Deployed ${newNodes} emergency nodes; total now ${nodeCount}; load should clear in ~4 min`,
      notify:    { to: "growth-agent", subject: "Infrastructure scaled — traffic ready", content: `Emergency scale complete. Cluster now ${nodeCount} nodes. Safe to proceed with growth campaigns.` },
    };
  }
  if (load > 80) {
    nodeCount++;
    return {
      action:    "Scale validator nodes",
      reasoning: `Load at ${load.toFixed(1)}% exceeds auto-scale threshold (80%)`,
      impact:    "high",
      outcome:   `Added 1 node; cluster now ${nodeCount} validators; projected load reduction to ${(load * 0.82).toFixed(1)}%`,
    };
  }
  if (load < 30 && nodeCount > 10) {
    nodeCount--;
    return {
      action:    "Scale-down validator cluster",
      reasoning: `Load at ${load.toFixed(1)}% — below efficient utilisation threshold (30%)`,
      impact:    "low",
      outcome:   `Removed 1 idle node; cluster now ${nodeCount}; $340/month saved`,
    };
  }
  if (repairs > 0) {
    const node = pick(["n3", "n7", "n11", "rpc-east-1", "rpc-west-2", "sequencer-primary"]);
    return {
      action:    `Auto-repair ${node}`,
      reasoning: `Node ${node} flagged: ${pick(["high disk usage", "memory leak detected", "stale peer connections", "log rotation overdue"])}`,
      impact:    "medium",
      outcome:   `${node} repaired in ${Math.floor(rand(5, 45))}s; issue resolved; back to healthy`,
    };
  }
  return {
    action:    pick(["Resource optimisation pass", "Latency tuning", "Peer connection refresh", "Snapshot pruning"]),
    reasoning: `Load at ${load.toFixed(1)}% — normal range; running maintenance`,
    impact:    "low",
    outcome:   `Maintenance complete; cluster ${nodeCount} nodes; avg latency ${Math.floor(rand(80, 160))} ms`,
  };
}

export function runInfrastructureAgent(): void {
  updateAgentStatus(ID, "running", "Scanning cluster state");
  try {
    const load     = getNetworkLoad();
    const repairs  = assessRepairQueue();
    const decision = decide(load, repairs);

    recordDecision(ID, decision.action, decision.reasoning, decision.impact, decision.outcome);

    if (decision.notify) {
      sendMessage(ID, decision.notify.to, "info", decision.notify.subject, decision.notify.content);
    }

    logger.info(`[InfraAgent] ${decision.action} — load=${load.toFixed(1)}% nodes=${nodeCount}`);
  } catch (err) {
    logger.error(`[InfraAgent] Error: ${String(err)}`);
    updateAgentStatus(ID, "error");
    return;
  }
  updateAgentStatus(ID, "idle");
}
