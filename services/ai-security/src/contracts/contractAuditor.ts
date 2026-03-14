/**
 * contractAuditor.ts — Smart contract security analyser
 *
 * Performs static pattern analysis on Solidity source / ABI snippets.
 * Checks for the most common vulnerability classes:
 *
 *   • Reentrancy (state change after external call)
 *   • Integer overflow / underflow (unchecked arithmetic in older Solidity)
 *   • Access control flaws (missing onlyOwner / modifier guards)
 *   • tx.origin auth (phishable)
 *   • Delegatecall to user-supplied address
 *   • Selfdestruct without access control
 *   • Unrestricted ETH withdrawal patterns
 *
 * Does NOT execute code or make external calls — pure string analysis.
 * For production audits integrate Slither or MythX via subprocess.
 */

import logger from "../utils/logger";

export type VulnSeverity = "info" | "low" | "medium" | "high" | "critical";

export interface VulnFinding {
  id: string;
  rule: string;
  severity: VulnSeverity;
  description: string;
  evidence: string;
  lineHint?: number;
}

export interface AuditReport {
  id: string;
  timestamp: string;
  contractName: string;
  findings: VulnFinding[];
  passed: boolean;
  blocked: boolean;
  score: number; // 0–100, higher = safer
  summary: string;
}

const reports: AuditReport[] = [];
const MAX_REPORTS = 200;
const MAX_SOURCE_LEN = 200_000; // guard against huge payloads

// ── Static rule set ───────────────────────────────────────────────────────────

interface Rule {
  id: string;
  pattern: RegExp;
  severity: VulnSeverity;
  description: string;
  note: string;
}

const RULES: Rule[] = [
  {
    id:          "REENTRANCY",
    pattern:     /call\s*\{.*?value.*?\}|\.call\.value\s*\(|\.transfer\s*\(/gs,
    severity:    "high",
    description: "Potential reentrancy — external call before state update",
    note:        "Ensure state changes happen before any external call (checks-effects-interactions)",
  },
  {
    id:          "TX_ORIGIN",
    pattern:     /tx\.origin/g,
    severity:    "high",
    description: "tx.origin authentication is phishable — use msg.sender",
    note:        "Replace tx.origin with msg.sender for access control",
  },
  {
    id:          "UNCHECKED_MATH",
    pattern:     /pragma solidity\s+\^?0\.[0-7]\./,
    severity:    "medium",
    description: "Solidity <0.8.0 does not auto-revert on integer overflow",
    note:        "Use SafeMath or upgrade to Solidity >=0.8.0",
  },
  {
    id:          "DELEGATECALL",
    pattern:     /delegatecall\s*\(/g,
    severity:    "critical",
    description: "delegatecall to user-controlled address — storage hijack risk",
    note:        "Ensure delegatecall target is a trusted, audited contract",
  },
  {
    id:          "SELFDESTRUCT",
    pattern:     /selfdestruct\s*\(|suicide\s*\(/g,
    severity:    "high",
    description: "selfdestruct present — verify strict access control",
    note:        "Gate selfdestruct behind onlyOwner or governance multisig",
  },
  {
    id:          "NO_ACCESS_MODIFIER",
    pattern:     /function\s+\w+\s*\([^)]*\)\s+public\s+(?!view|pure|returns)/g,
    severity:    "medium",
    description: "Public state-changing function with no visible access modifier",
    note:        "Add onlyOwner, onlyRole, or equivalent access control",
  },
  {
    id:          "BLOCK_TIMESTAMP",
    pattern:     /block\.timestamp|now\s*[<>=]/g,
    severity:    "low",
    description: "block.timestamp can be manipulated by miners within ~15 s",
    note:        "Avoid using timestamp for precise timing or randomness",
  },
  {
    id:          "ARBITRARY_SEND",
    pattern:     /\.call\s*\{[^}]*\}\s*\(""\)/g,
    severity:    "high",
    description: "Arbitrary ETH send pattern — ensure recipient is controlled",
    note:        "Whitelist withdrawal recipients or use a pull-payment pattern",
  },
];

// ── Severity scoring ──────────────────────────────────────────────────────────

const SEVERITY_WEIGHT: Record<VulnSeverity, number> = {
  info:     0,
  low:      5,
  medium:   15,
  high:     30,
  critical: 50,
};

const BLOCK_THRESHOLD = 50; // score deduction threshold to block deployment

// ── Auditor ───────────────────────────────────────────────────────────────────

export function auditContract(contractName: string, source: string): AuditReport {
  // Guard: cap source size to prevent ReDoS on huge inputs
  const safeSrc = source.slice(0, MAX_SOURCE_LEN);
  const findings: VulnFinding[] = [];

  for (const rule of RULES) {
    // Reset regex state
    rule.pattern.lastIndex = 0;
    let match: RegExpExecArray | null;
    const globalRule = new RegExp(rule.pattern.source, rule.pattern.flags.includes("g") ? rule.pattern.flags : rule.pattern.flags + "g");
    while ((match = globalRule.exec(safeSrc)) !== null) {
      // Simple line count
      const line = safeSrc.slice(0, match.index).split("\n").length;
      findings.push({
        id:          `${rule.id}-${findings.length}`,
        rule:        rule.id,
        severity:    rule.severity,
        description: rule.description,
        evidence:    match[0].slice(0, 80),
        lineHint:    line,
      });
      // Avoid catastrophic backtracking: one finding per rule is enough for medium+ severity
      if (rule.severity === "critical" || rule.severity === "high") break;
    }
  }

  const deduction = findings.reduce((sum, f) => sum + SEVERITY_WEIGHT[f.severity], 0);
  const score     = Math.max(0, 100 - deduction);
  const blocked   = deduction >= BLOCK_THRESHOLD;

  const report: AuditReport = {
    id:           `audit-${Date.now()}`,
    timestamp:    new Date().toISOString(),
    contractName,
    findings,
    passed:       findings.filter((f) => f.severity === "critical" || f.severity === "high").length === 0,
    blocked,
    score,
    summary: blocked
      ? `BLOCKED — security score ${score}/100. Address critical/high findings before deployment.`
      : findings.length === 0
      ? `PASSED — no issues detected (score ${score}/100)`
      : `WARNINGS — score ${score}/100. ${findings.length} finding(s) to review.`,
  };

  reports.unshift(report);
  if (reports.length > MAX_REPORTS) reports.pop();

  if (blocked) {
    logger.warn(`[ContractAuditor] BLOCKED ${contractName}: score=${score}`, {
      findings: findings.map((f) => ({ rule: f.rule, severity: f.severity })),
    });
  } else {
    logger.info(`[ContractAuditor] Audited ${contractName}: score=${score}, findings=${findings.length}`);
  }

  return report;
}

export function getAuditReports(limit = 20): AuditReport[] { return reports.slice(0, limit); }
export function getAuditSummary() {
  const blocked = reports.filter((r) => r.blocked).length;
  const passed  = reports.filter((r) => r.passed && !r.blocked).length;
  return { total: reports.length, passed, blocked, warnings: reports.length - passed - blocked };
}
