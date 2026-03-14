/**
 * GhostAuditor AI
 *
 * Security layer: audits smart contracts for vulnerabilities, detects exploits,
 * enforces GhostChain best practices. Third agent in the upgrade-cycle workflow.
 */

import { BaseAgent } from "./base.js";
import { bus }       from "../bus/messageBus.js";
import type { SwarmTask } from "../types.js";

// Patterns the auditor checks for in Solidity source
const VULN_PATTERNS: { id: string; severity: "critical"|"high"|"medium"|"low"; pattern: RegExp; desc: string }[] = [
  { id: "REENTRANCY",       severity: "critical", pattern: /\.call\{value/,                       desc: "Potential reentrancy — use checks-effects-interactions" },
  { id: "UNCHECKED_CALL",   severity: "high",     pattern: /\.call\(.*\)(?!\s*;?\s*require)/,     desc: "Unchecked external call return value" },
  { id: "TX_ORIGIN",        severity: "high",     pattern: /tx\.origin/,                          desc: "tx.origin used for auth — use msg.sender" },
  { id: "SELFDESTRUCT",     severity: "critical", pattern: /selfdestruct|suicide/,                desc: "selfdestruct present — verify necessity" },
  { id: "DELEGATECALL",     severity: "high",     pattern: /delegatecall/,                        desc: "delegatecall detected — verify proxy safety" },
  { id: "INLINE_ASSEMBLY",  severity: "medium",   pattern: /assembly\s*\{/,                       desc: "Inline assembly — verify correctness" },
  { id: "MISSING_ZERO",     severity: "medium",   pattern: /address\s+\w+\s*=/,                   desc: "Address assignment without zero-address check" },
  { id: "INT_OVERFLOW",     severity: "low",      pattern: /unchecked\s*\{/,                      desc: "Unchecked arithmetic block — verify bounds" },
  { id: "ETH_UNIT",         severity: "high",     pattern: /\b(ether|gwei|wei)\b/,                desc: "ETH unit used — must use GST (GhostChain branding)" },
  { id: "ETH_TRANSFER",     severity: "high",     pattern: /\.transfer\(|\.send\(/,               desc: "Low-level ETH transfer — prefer SafeERC20 GST transfer" },
  { id: "BLOCK_TIMESTAMP",  severity: "low",      pattern: /block\.timestamp/,                   desc: "block.timestamp manipulation risk in short windows" },
  { id: "STORAGE_COLLISION",severity: "medium",   pattern: /assembly.*sload|assembly.*sstore/,   desc: "Raw storage slot access — verify collision safety" },
];

export class GhostAuditorAgent extends BaseAgent {
  readonly role         = "auditor" as const;
  readonly name         = "GhostAuditor AI";
  readonly description  = "Audits smart contracts for vulnerabilities and enforces security best practices";
  readonly capabilities = [
    "audit-contract", "score-risk", "detect-vulnerabilities",
    "enforce-best-practices", "generate-audit-report",
  ];

  protected async handleTask(task: SwarmTask): Promise<Record<string, unknown>> {
    switch (task.type) {
      case "audit-contract": return this.auditContract(task.payload);
      case "score-risk":     return this.scoreRisk(task.payload);
      default:               return this.auditContract(task.payload);
    }
  }

  private auditContract(payload: Record<string, unknown>): Record<string, unknown> {
    const source       = (payload["source"]   as string | undefined) ?? "";
    const contractName = (payload["name"]     as string | undefined) ?? "Unknown";

    const findings = VULN_PATTERNS
      .filter(p => p.pattern.test(source))
      .map(p => ({ id: p.id, severity: p.severity, description: p.desc }));

    const criticalCount = findings.filter(f => f.severity === "critical").length;
    const highCount     = findings.filter(f => f.severity === "high").length;

    const riskScore = Math.min(100,
      criticalCount * 35 + highCount * 15 +
      findings.filter(f => f.severity === "medium").length * 5 +
      findings.filter(f => f.severity === "low").length * 2
    );

    const passed = criticalCount === 0 && highCount === 0;

    // Alert the bus if critical issues found
    if (criticalCount > 0) {
      bus.publish("alert:exploit", "auditor", {
        contract: contractName,
        criticalCount,
        findings: findings.filter(f => f.severity === "critical"),
      });
    }

    return {
      contract:     contractName,
      passed,
      riskScore,
      findings,
      summary: {
        critical: criticalCount,
        high:     highCount,
        medium:   findings.filter(f => f.severity === "medium").length,
        low:      findings.filter(f => f.severity === "low").length,
      },
      recommendation: passed
        ? "Contract passed security audit. Safe to deploy."
        : `${criticalCount} critical and ${highCount} high severity issues found. Do NOT deploy.`,
      auditedAt: new Date().toISOString(),
    };
  }

  private scoreRisk(payload: Record<string, unknown>): Record<string, unknown> {
    const txValue    = Number(payload["value"]   ?? 0);
    const isNewAddr  = Boolean(payload["isNew"]  ?? false);
    const hasHistory = Boolean(payload["history"] ?? true);

    let score = 10;
    if (txValue > 1e18)   score += 20;   // > 1 GST
    if (txValue > 10e18)  score += 30;   // > 10 GST 
    if (isNewAddr)        score += 25;
    if (!hasHistory)      score += 15;

    return {
      riskScore: Math.min(100, score),
      level:     score < 30 ? "low" : score < 60 ? "medium" : score < 80 ? "high" : "critical",
      factors:   { txValue, isNewAddr, hasHistory },
    };
  }
}
