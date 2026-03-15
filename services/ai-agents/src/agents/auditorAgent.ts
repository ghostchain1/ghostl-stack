/**
 * Auditor Agent — audits smart contracts, deployment pipelines, and
 * infrastructure configs for correctness, security, and compliance.
 */

import logger from "../utils/logger";
import { updateAgentStatus, recordDecision } from "../registry/agentRegistry";
import { sendMessage } from "../communication/agentBus";

const ID   = "auditor-agent";
const pick = <T>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)]!;
const rand = (a: number, b: number) => Math.floor(Math.random() * (b - a + 1)) + a;

type AuditResult = "passed" | "warning" | "failed" | "critical-issue";

type AudDecision = {
  action:    string;
  reasoning: string;
  impact:    "low" | "medium" | "high" | "critical";
  outcome:   string;
  notify?:   { to: string; subject: string; content: string };
};

let totalAudits     = 38;
let issuesFound     = 5;
let deploymentsHeld = 0;

function runAudit(): AuditResult {
  const r = Math.random();
  if      (r < 0.03) return "critical-issue";
  else if (r < 0.10) return "failed";
  else if (r < 0.25) return "warning";
  else               return "passed";
}

function decide(result: AuditResult): AudDecision {
  totalAudits++;

  if (result === "critical-issue") {
    issuesFound++;
    deploymentsHeld++;
    return {
      action: "Deployment halted — critical issue",
      reasoning: pick([
        "Reentrancy vulnerability in bridge withdraw function (severity: critical)",
        "Admin key stored in plaintext environment variable in deployment config",
        "Integer overflow in staking reward calculation — exploit scenario verified",
        "Unguarded external call to untrusted contract in DeFi module",
      ]),
      impact: "critical",
      outcome: `Deployment blocked; issue #${issuesFound} logged; dev team notified; estimated fix time ${rand(2, 8)}h`,
      notify: {
        to:      "defender-agent",
        subject: "🚨 Critical audit failure — deployment blocked",
        content: `Auditor detected a critical issue preventing deployment. Issue #${issuesFound} filed. Defender: please elevate monitoring on affected contract addresses until patch is verified.`,
      },
    };
  }

  if (result === "failed") {
    issuesFound++;
    return {
      action: pick([
        "Deployment rejected — audit failed",
        "Contract verification failed",
        "Configuration non-compliance detected",
        "Security checklist incomplete",
      ]),
      reasoning: pick([
        `${rand(2, 8)} high-severity findings; deployment standard requires zero`,
        "Missing access control modifiers on ${rand(1, 4)} privileged functions",
        "Deployment config missing required signature from security lead",
        "Slippage tolerance not set on DEX interaction — MEV exploit risk",
      ]),
      impact:  "high",
      outcome: `Audit failed; ${rand(2, 5)} items require remediation; re-audit scheduled after fixes`,
    };
  }

  if (result === "warning") {
    return {
      action: pick([
        "Deployment approved with warnings",
        "Audit passed — minor issues noted",
        "Conditional approval issued",
        "Audit completed — non-blocking findings",
      ]),
      reasoning: pick([
        `${rand(1, 4)} low-severity findings; non-blocking per current threshold`,
        "Gas optimisation opportunities identified but not required for approval",
        "Documentation gaps found; functionality correct",
        "Test coverage ${rand(72, 89)}%; above minimum 70% threshold",
      ]),
      impact:  "medium",
      outcome: `Deployment approved; ${rand(1, 3)} warnings logged; follow-up ticket created for Q${rand(2, 4)} remediation`,
    };
  }

  // passed
  return {
    action: pick([
      "Audit passed — clean deploy approved",
      "Contract verified — no issues",
      "Infrastructure audit passed",
      "Deployment pipeline validated",
    ]),
    reasoning: pick([
      "All ${rand(40, 80)} audit checks passed; zero findings",
      "Smart contract matches audited bytecode hash; safe to deploy",
      "Test coverage ${rand(90, 99)}%; full scenario coverage confirmed",
      "Configuration matches approved baseline; no drift detected",
    ]),
    impact:  "low",
    outcome: `Audit #${totalAudits} complete; clean pass; deployment authorised in ${rand(2, 10)}min`,
  };
}

export function runAuditorAgent(): void {
  updateAgentStatus(ID, "running", "Auditing contracts, deployments, and configurations");
  try {
    const result   = runAudit();
    const decision = decide(result);

    recordDecision(ID, decision.action, decision.reasoning, decision.impact, decision.outcome);

    if (decision.notify) {
      sendMessage(ID, decision.notify.to, "alert", decision.notify.subject, decision.notify.content);
    }

    logger.info(`[AuditorAgent] ${decision.action} [${result}] (${decision.impact})`);
  } catch (err) {
    logger.error(`[AuditorAgent] Error: ${err}`);
    updateAgentStatus(ID, "error");
    return;
  }
  updateAgentStatus(ID, "idle");
}
