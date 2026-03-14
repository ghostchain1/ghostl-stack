/**
 * Security Audit — simulates AI-driven static analysis of smart contracts
 * and service code (reentrancy, access control, integer overflow, etc.)
 */

import { v4 as uuid }          from "uuid";
import { updateContractAudit } from "../contracts/contractBuilder";
import logger                  from "../utils/logger";

export type FindingSeverity = "critical" | "high" | "medium" | "low" | "info";
export type FindingType     =
  | "reentrancy"
  | "access-control"
  | "integer-overflow"
  | "unchecked-call"
  | "gas-limit"
  | "front-running"
  | "timestamp-dependency"
  | "self-destruct"
  | "price-oracle-manipulation";

export interface AuditFinding {
  id:             string;
  type:           FindingType;
  severity:       FindingSeverity;
  location:       string;
  description:    string;
  recommendation: string;
}

export interface AuditReport {
  id:          string;
  target:      string;
  targetType:  "contract" | "service";
  auditedAt:   number;
  score:       number;    // 0-100
  findings:    AuditFinding[];
  criticals:   number;
  highs:       number;
  mediums:     number;
  lows:        number;
  passed:      boolean;   // true if score >= 85 and no criticals
  recommendation: string;
  duration_ms: number;
}

const MAX_REPORTS = 200;
const store: AuditReport[] = [];

function pick<T>(arr: T[]): T { return arr[Math.floor(Math.random() * arr.length)]!; }
function rand(a: number, b: number) { return Math.floor(Math.random() * (b - a + 1)) + a; }

const FINDINGS_DB: Record<FindingType, { desc: string; rec: string; severity: FindingSeverity }[]> = {
  "reentrancy": [
    { severity: "critical", desc: "External call before state update enables reentrant draining of contract balance.", rec: "Apply Checks-Effects-Interactions pattern; use ReentrancyGuard." },
    { severity: "high",     desc: "Token.transfer() called before balances mapping updated.", rec: "Update internal state before any external call." },
  ],
  "access-control": [
    { severity: "high",     desc: "Privileged function missing onlyOwner modifier — any caller may invoke.", rec: "Add onlyOwner or role-based access control (AccessControl)." },
    { severity: "medium",   desc: "Admin address can be set by non-admin during initialization window.", rec: "Lock initializer or use OpenZeppelin Initializable with onlyInitializing." },
  ],
  "integer-overflow": [
    { severity: "medium",   desc: "Unchecked arithmetic on Solidity < 0.8 allows overflow.", rec: "Upgrade to Solidity ^0.8.0 or use SafeMath." },
    { severity: "low",      desc: "Type downcast from uint256 to uint128 may silently truncate.", rec: "Add explicit bounds check before downcasting." },
  ],
  "unchecked-call": [
    { severity: "high",     desc: "Return value of low-level call() not checked — failures are silent.", rec: "Check return bool or use Address.sendValue()." },
    { severity: "medium",   desc: "ERC20 transferFrom return value ignored.", rec: "Use SafeERC20 or check return value." },
  ],
  "gas-limit": [
    { severity: "medium",   desc: "Unbounded loop over dynamic array — risk of block gas limit DoS.", rec: "Use pagination or limit loop iterations." },
    { severity: "low",      desc: "Redundant storage reads inside loop increase gas costs.", rec: "Cache storage variable in memory before loop." },
  ],
  "front-running": [
    { severity: "medium",   desc: "Swap price slippage not enforced — sandwich attack is feasible.", rec: "Add minAmountOut parameter and enforce it." },
    { severity: "low",      desc: "Randomness source based on block.timestamp is predictable.", rec: "Use Chainlink VRF for randomness." },
  ],
  "timestamp-dependency": [
    { severity: "low",      desc: "Deadline check uses block.timestamp which miners can slightly manipulate.", rec: "Allow a tolerance window (±15 seconds) or use block numbers." },
  ],
  "self-destruct": [
    { severity: "high",     desc: "selfdestruct() callable by non-owner; contract funds can be drained.", rec: "Remove selfdestruct or restrict to owner with timelock." },
  ],
  "price-oracle-manipulation": [
    { severity: "critical", desc: "Spot price from Uniswap V2 used without TWAP — flashloan manipulation possible.", rec: "Use TWAP (time-weighted average price) oracle or Chainlink price feed." },
  ],
};

function randomFinding(target: string): AuditFinding {
  const type = pick(Object.keys(FINDINGS_DB) as FindingType[]);
  const data = pick(FINDINGS_DB[type]!);
  return {
    id:             uuid(),
    type,
    severity:       data.severity,
    location:       `${target}:${rand(10, 420)}`,
    description:    data.desc,
    recommendation: data.rec,
  };
}

function calcScore(findings: AuditFinding[]): number {
  const c = findings.filter(f => f.severity === "critical").length;
  const h = findings.filter(f => f.severity === "high").length;
  const m = findings.filter(f => f.severity === "medium").length;
  const l = findings.filter(f => f.severity === "low").length;
  return Math.max(0, 100 - c * 25 - h * 12 - m * 5 - l * 2);
}

function buildReport(target: string, targetType: "contract" | "service", hoursAgo = 0): AuditReport {
  const roll = Math.random();
  let numFindings = 0;
  if      (roll < 0.05) numFindings = rand(1, 3); // critical present
  else if (roll < 0.20) numFindings = rand(1, 4); // has highs
  else if (roll < 0.55) numFindings = rand(1, 3); // medium/low
  else                  numFindings = 0;            // clean

  const findings: AuditFinding[] = [];
  // If we want a critical for first tier
  if (roll < 0.05 && numFindings > 0) {
    const type = pick(["reentrancy", "price-oracle-manipulation"] as FindingType[]);
    const data = FINDINGS_DB[type]![0]!;
    findings.push({
      id: uuid(), type, severity: "critical",
      location: `${target}:${rand(10, 300)}`,
      description: data.desc, recommendation: data.rec,
    });
    numFindings--;
  }
  for (let i = 0; i < numFindings; i++) findings.push(randomFinding(target));

  const score = calcScore(findings);
  const criticals = findings.filter(f => f.severity === "critical").length;
  return {
    id:          uuid(),
    target,
    targetType,
    auditedAt:   Date.now() - hoursAgo * 3_600_000,
    score,
    findings,
    criticals,
    highs:   findings.filter(f => f.severity === "high").length,
    mediums: findings.filter(f => f.severity === "medium").length,
    lows:    findings.filter(f => f.severity === "low").length,
    passed:  score >= 85 && criticals === 0,
    recommendation: criticals > 0
      ? "Blocked: resolve critical vulnerabilities before deployment."
      : score >= 85 ? "Approved for deployment." : "Address high/medium findings before deployment.",
    duration_ms: rand(800, 5500),
  };
}

function seed() {
  const contracts = ["GhostStaking", "GhostSwapPool", "GhostDAO", "GhostBridge", "GhostToken", "GhostMarket", "GhostVesting"];
  const services  = ["ai-governance", "ai-economy", "ai-infrastructure"];
  for (let i = 0; i < 10; i++) {
    const isContract = i < 7;
    const target     = isContract ? pick(contracts) : pick(services);
    const report     = buildReport(target, isContract ? "contract" : "service", rand(2, 200));
    store.push(report);
  }
  logger.info(`[SecurityAudit] Seeded ${store.length} audit reports`);
}

export function auditCode(target: string, contractId?: string): AuditReport {
  const targetType = contractId ? "contract" : "service";
  const report = buildReport(target, targetType);

  if (contractId) {
    if (report.criticals > 0) {
      updateContractAudit(contractId, "blocked");
      logger.warn(`[SecurityAudit] BLOCKED ${target} — ${report.criticals} critical finding(s)`);
    } else if (report.passed) {
      updateContractAudit(contractId, "clean");
      logger.info(`[SecurityAudit] CLEAN ${target} — score ${report.score}/100`);
    } else {
      updateContractAudit(contractId, "issues-found");
      logger.warn(`[SecurityAudit] ISSUES ${target} — score ${report.score}/100`);
    }
  }

  store.unshift(report);
  if (store.length > MAX_REPORTS) store.pop();
  return report;
}

export function getAudits(opts: {
  target?: string; passed?: boolean; limit?: number;
} = {}): AuditReport[] {
  let reports = [...store];
  if (opts.target !== undefined) reports = reports.filter(r => r.target === opts.target);
  if (opts.passed !== undefined) reports = reports.filter(r => r.passed === opts.passed);
  return reports.slice(0, opts.limit ?? 50);
}

export function getAuditStats() {
  const avgScore = store.length
    ? Math.round(store.reduce((s, r) => s + r.score, 0) / store.length)
    : 0;
  return {
    total:      store.length,
    passed:     store.filter(r => r.passed).length,
    failed:     store.filter(r => !r.passed).length,
    avgScore,
    totalFindings: store.reduce((s, r) => s + r.findings.length, 0),
    criticals:  store.reduce((s, r) => s + r.criticals, 0),
    highs:      store.reduce((s, r) => s + r.highs, 0),
  };
}

seed();
