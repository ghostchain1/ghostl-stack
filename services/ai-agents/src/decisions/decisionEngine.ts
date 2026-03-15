/**
 * Decision Engine — evaluates multi-agent coordination data and determines
 * cross-cutting system actions. Used by the coordination layer to resolve
 * conflicting signals from different role-based and domain agents.
 */

import logger from "../utils/logger";
import { getKnowledge } from "../knowledge/knowledgeBase";

export type DecisionSeverity = "info" | "warning" | "action" | "emergency";

export interface SystemDecision {
  id:          string;
  decision:    string;
  reason:      string;
  severity:    DecisionSeverity;
  affectedIds: string[];   // agent IDs involved
  timestamp:   number;
}

let _decisionCounter = 0;

function makeId(): string {
  _decisionCounter++;
  return `de-${Date.now()}-${_decisionCounter}`;
}

export interface EvaluationInput {
  auditIssues?:      number;   // issues found by auditor
  auditPassed?:      boolean;
  threatLevel?:      "none" | "low" | "medium" | "high" | "critical";
  activeIncidents?:  number;
  nodeOnlineRatio?:  number;   // 0.0 – 1.0
  cpuPercent?:       number;
  memPercent?:       number;
  governanceBlocked?: boolean; // critical governance vote failed / quorum not met
}

/**
 * Evaluate agent signals and return the highest-priority system decision.
 */
export function evaluateAgents(input: EvaluationInput): SystemDecision {
  const kb = getKnowledge();

  // 1. Emergency: active incidents + critical threat
  if ((input.activeIncidents ?? kb.security.activeIncidents) > 0 &&
      (input.threatLevel ?? kb.security.threatLevel) === "critical") {
    return {
      id:          makeId(),
      decision:    "Emergency lockdown: halt all deployments, elevate defences",
      reason:      `Active incidents (${input.activeIncidents ?? kb.security.activeIncidents}) with critical threat level`,
      severity:    "emergency",
      affectedIds: ["defender-agent", "security-agent", "operator-agent", "auditor-agent"],
      timestamp:   Date.now(),
    };
  }

  // 2. Emergency: audit failure
  if (input.auditPassed === false && (input.auditIssues ?? 0) > 0) {
    return {
      id:          makeId(),
      decision:    "Hold all deployments pending audit remediation",
      reason:      `Audit failed with ${input.auditIssues} issue(s)`,
      severity:    "emergency",
      affectedIds: ["auditor-agent", "operator-agent"],
      timestamp:   Date.now(),
    };
  }

  // 3. Warning: nodes offline
  const ratio = input.nodeOnlineRatio ?? (kb.infrastructure.onlineNodes / Math.max(kb.infrastructure.nodeCount, 1));
  if (ratio < 0.5) {
    return {
      id:          makeId(),
      decision:    "Emergency scale-out: node availability below 50%",
      reason:      `Only ${Math.round(ratio * 100)}% of nodes online`,
      severity:    "emergency",
      affectedIds: ["operator-agent", "infrastructure-agent"],
      timestamp:   Date.now(),
    };
  }

  // 4. Warning: high threat
  const threat = input.threatLevel ?? kb.security.threatLevel;
  if (threat === "high" || threat === "critical") {
    return {
      id:          makeId(),
      decision:    "Elevate security posture; pause non-critical deployments",
      reason:      `Threat level: ${threat}`,
      severity:    "action",
      affectedIds: ["defender-agent", "security-agent"],
      timestamp:   Date.now(),
    };
  }

  // 5. Warning: resource pressure
  if ((input.cpuPercent ?? kb.infrastructure.avgCpuPercent) > 85 ||
      (input.memPercent ?? kb.infrastructure.avgMemoryPercent) > 85) {
    return {
      id:          makeId(),
      decision:    "Scale infrastructure; resource utilisation above 85% threshold",
      reason:      `CPU ${input.cpuPercent ?? kb.infrastructure.avgCpuPercent}% / Mem ${input.memPercent ?? kb.infrastructure.avgMemoryPercent}%`,
      severity:    "action",
      affectedIds: ["operator-agent", "infrastructure-agent"],
      timestamp:   Date.now(),
    };
  }

  // 6. Governance blocked
  if (input.governanceBlocked) {
    return {
      id:          makeId(),
      decision:    "Governance remediation required; critical vote failed",
      reason:      "Governance-dependent action blocked awaiting vote resolution",
      severity:    "warning",
      affectedIds: ["governance-agent", "strategist-agent"],
      timestamp:   Date.now(),
    };
  }

  // 7. All clear
  return {
    id:          makeId(),
    decision:    "All systems nominal — continue standard operations",
    reason:      "No blocking conditions detected across all agent signals",
    severity:    "info",
    affectedIds: [],
    timestamp:   Date.now(),
  };
}

/**
 * Run a full autonomous evaluation using current knowledge base state only.
 */
export function runAutonomousEvaluation(): SystemDecision {
  const kb = getKnowledge();
  logger.debug("[DecisionEngine] Running autonomous evaluation");
  return evaluateAgents({
    threatLevel:    kb.security.threatLevel,
    activeIncidents: kb.security.activeIncidents,
    auditPassed:    kb.security.lastAuditPassed,
    nodeOnlineRatio: kb.infrastructure.onlineNodes / Math.max(kb.infrastructure.nodeCount, 1),
    cpuPercent:     kb.infrastructure.avgCpuPercent,
    memPercent:     kb.infrastructure.avgMemoryPercent,
  });
}
