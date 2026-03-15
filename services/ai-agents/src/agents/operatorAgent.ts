/**
 * Operator Agent — manages day-to-day infrastructure operations: node deployments,
 * cluster scaling, rollout coordination, and liaison with the HyperGhost control plane.
 */

import logger from "../utils/logger";
import { updateAgentStatus, recordDecision } from "../registry/agentRegistry";
import { sendMessage } from "../communication/agentBus";

const ID   = "operator-agent";
const pick = <T>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)]!;
const rand = (a: number, b: number) => Math.floor(Math.random() * (b - a + 1)) + a;

type OperationType = "deploy" | "scale" | "rollback" | "maintenance" | "monitor";

type OpsDecision = {
  action:    string;
  reasoning: string;
  impact:    "low" | "medium" | "high" | "critical";
  outcome:   string;
  notify?:   { to: string; subject: string; content: string };
};

let deploymentsCompleted = 34;
let nodesManaged         = 6;
let rolloutsActive       = 0;
let uptimePercent        = 99.94;

function pickOperation(): OperationType {
  const options: OperationType[] = [
    "monitor", "monitor", "monitor",
    "deploy",
    "scale",
    "maintenance",
    "rollback",
  ];
  return pick(options);
}

function decide(op: OperationType): OpsDecision {
  if (op === "deploy") {
    deploymentsCompleted++;
    rolloutsActive++;
    const target = pick([
      "GhostL2 sequencer", "validator node n8", "RPC cluster east",
      "bridge relay service", "archival node", "bootnode cluster",
      "block explorer backend", "indexer service",
    ]);
    return {
      action:    `Deploy: ${target}`,
      reasoning: pick([
        "Deployment pipeline triggered by successful auditor approval",
        "Scheduled release window; all pre-flight checks passed",
        "Hot-fix deployment; critical patch approved via fast-track governance",
        "Blue-green swap triggered; canary metrics healthy for ${rand(15, 60)}min",
      ]),
      impact:    "medium",
      outcome:   `${target} deployed (deployment #${deploymentsCompleted}); zero downtime; health checks passing; rollout active`,
      notify: {
        to:      "architect-agent",
        subject: `Deployment complete: ${target}`,
        content: `Operator has deployed ${target} (deployment #${deploymentsCompleted}). All health checks green. Architect: please validate deployed version against latest specification.`,
      },
    };
  }

  if (op === "scale") {
    const delta = rand(1, 4);
    nodesManaged += delta;
    return {
      action:    pick([
        `Scale out: +${delta} validator node(s)`,
        "Horizontal RPC cluster expansion",
        "Auto-scale sequencer replicas",
        `Scale HCL compute: +${delta} VM(s)`,
      ]),
      reasoning: pick([
        `Network load at ${rand(80, 95)}% capacity; threshold was ${rand(75, 85)}%`,
        "Block production latency rising; additional validators improve finalisation time",
        "RPC p95 latency exceeded SLA; adding capacity",
        "HCL utilisation >80%; auto-scale policy triggered",
      ]),
      impact:    "high",
      outcome:   `+${delta} unit(s) added; total managed: ${nodesManaged}; load reduced to ${rand(40, 65)}%; SLA restored`,
    };
  }

  if (op === "rollback") {
    if (rolloutsActive > 0) rolloutsActive--;
    return {
      action:    "Rollback initiated",
      reasoning: pick([
        "Error rate spike detected post-deploy; automatic rollback threshold exceeded",
        "Memory leak confirmed in new build; health check failing on 2/3 instances",
        "Block production halted after upgrade; immediate rollback required",
        "Canary analysis: ${rand(15, 35)}% error increase; automated gate triggered rollback",
      ]),
      impact:    "high",
      outcome:   `Previous stable version restored in ${rand(45, 180)}s; error rate back to baseline; incident filed`,
      notify: {
        to:      "auditor-agent",
        subject: "Rollback executed — post-mortem audit required",
        content: "Operator executed an automated rollback after deployment health gate failure. Auditor: please conduct a post-mortem review of the failed deployment artefacts.",
      },
    };
  }

  if (op === "maintenance") {
    return {
      action:    pick([
        "Scheduled maintenance window executed",
        "Node certificate renewal completed",
        "Log rotation and disk cleanup",
        "Security patch applied — rolling restart",
      ]),
      reasoning: pick([
        "TLS certificates expiring in ${rand(3, 14)} days; proactive renewal",
        "Disk utilisation >80% on ${rand(1, 3)} node(s); cleanup required",
        "Monthly security patch cycle; ${rand(3, 8)} CVE patches applied",
        "Scheduled maintenance: ${rand(2, 6)}h window at low-traffic time",
      ]),
      impact:    "low",
      outcome:   `Maintenance complete; ${nodesManaged} nodes healthy; uptime maintained at ${uptimePercent}%`,
    };
  }

  // monitor
  const healthyNodes = rand(Math.floor(nodesManaged * 0.8), nodesManaged);
  return {
    action:    pick([
      "Network health monitoring cycle",
      "Node telemetry review",
      "SLA compliance check",
      "Performance baseline updated",
    ]),
    reasoning: pick([
      "Continuous monitoring tick; all systems nominal",
      "P95 block latency within SLA on all active chains",
      "Scheduled telemetry aggregation across all managed nodes",
      "Uptime SLA ${uptimePercent}% (target 99.9%); on track",
    ]),
    impact:    "low",
    outcome:   `${healthyNodes}/${nodesManaged} nodes healthy; avg CPU ${rand(30, 65)}%; avg memory ${rand(45, 75)}%; all chains producing blocks`,
  };
}

export function runOperatorAgent(): void {
  updateAgentStatus(ID, "running", "Executing infrastructure operations and deployment coordination");
  try {
    const op       = pickOperation();
    const decision = decide(op);

    recordDecision(ID, decision.action, decision.reasoning, decision.impact, decision.outcome);

    if (decision.notify) {
      sendMessage(ID, decision.notify.to, "command", decision.notify.subject, decision.notify.content);
    }

    logger.info(`[OperatorAgent] ${decision.action} [op=${op}] (${decision.impact})`);
  } catch (err) {
    logger.error(`[OperatorAgent] Error: ${err}`);
    updateAgentStatus(ID, "error");
    return;
  }
  updateAgentStatus(ID, "idle");
}
