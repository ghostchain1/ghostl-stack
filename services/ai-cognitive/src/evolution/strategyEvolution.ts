/**
 * GCL — Strategy Evolution
 * Maintains an evolving catalogue of strategies. Priorities are updated
 * every cognitive cycle based on new learning insights.
 */

import { v4 as uuid } from "uuid";
import type { LearningInsight } from "../learning/learningEngine";

export type Priority = "critical" | "high" | "medium" | "low" | "archived";

export interface EvolvedStrategy {
  id:              string;
  name:            string;
  domain:          string;
  linkedAgent:     string;
  priority:        Priority;
  successRate:     number;     // 0.0 – 1.0
  iterations:      number;     // how many times it has been evaluated
  lastUpdated:     number;     // timestamp
  lastOutcome:     "improved" | "degraded" | "stable";
  recommendation:  string;
  tags:            string[];
}

// ── Seed Strategies ───────────────────────────────────────────────────────────

const hoursAgo = (h: number) => Date.now() - h * 3_600_000;

const SEED_STRATEGIES: EvolvedStrategy[] = [
  {
    id: uuid(), name: "Adaptive Node Scaling",
    domain: "scaling", linkedAgent: "operator-agent",
    priority: "high", successRate: 0.88, iterations: 14, lastUpdated: hoursAgo(1),
    lastOutcome: "improved",
    recommendation: "Auto-scale at 75% load threshold; over-provision by 1 node buffer",
    tags: ["scaling", "infrastructure", "auto-scale"],
  },
  {
    id: uuid(), name: "DDoS Rate-Limit Protocol",
    domain: "security", linkedAgent: "defender-agent",
    priority: "critical", successRate: 0.95, iterations: 9, lastUpdated: hoursAgo(2),
    lastOutcome: "stable",
    recommendation: "Activate rate-limiting at 15K req/s; ban IPs exceeding 1K req/min",
    tags: ["security", "ddos", "rpc"],
  },
  {
    id: uuid(), name: "Developer Ecosystem Grants",
    domain: "marketing", linkedAgent: "strategist-agent",
    priority: "high", successRate: 0.82, iterations: 5, lastUpdated: hoursAgo(4),
    lastOutcome: "improved",
    recommendation: "Quarterly $200K grant pools targeting Solidity/Rust developers",
    tags: ["marketing", "grants", "developers"],
  },
  {
    id: uuid(), name: "Token Burn Cadence",
    domain: "tokenomics", linkedAgent: "economy-agent",
    priority: "high", successRate: 0.79, iterations: 11, lastUpdated: hoursAgo(6),
    lastOutcome: "stable",
    recommendation: "Burn 300–400K GST fortnightly from buy-back queue at price peaks",
    tags: ["tokenomics", "burn", "supply"],
  },
  {
    id: uuid(), name: "Canary Deployment Gate",
    domain: "deployment", linkedAgent: "operator-agent",
    priority: "medium", successRate: 0.72, iterations: 8, lastUpdated: hoursAgo(8),
    lastOutcome: "stable",
    recommendation: "Deploy to 5% traffic; auto-rollback if error rate > 2% within 60s",
    tags: ["deployment", "canary", "rollback"],
  },
  {
    id: uuid(), name: "Validator Retention Incentives",
    domain: "governance", linkedAgent: "governance-agent",
    priority: "high", successRate: 0.85, iterations: 6, lastUpdated: hoursAgo(10),
    lastOutcome: "improved",
    recommendation: "Monitor validator exit intent; propose reward bump if >10 exit in 7 days",
    tags: ["governance", "validators", "rewards"],
  },
  {
    id: uuid(), name: "Smart Contract Pre-Audit Gate",
    domain: "security", linkedAgent: "auditor-agent",
    priority: "critical", successRate: 0.99, iterations: 7, lastUpdated: hoursAgo(20),
    lastOutcome: "stable",
    recommendation: "Block all bridge/ERC20 deployments until auditor-agent confirms 0 critical vulns",
    tags: ["security", "audit", "smart-contracts"],
  },
  {
    id: uuid(), name: "Cross-Chain Partnership Outreach",
    domain: "partnerships", linkedAgent: "strategist-agent",
    priority: "medium", successRate: 0.74, iterations: 4, lastUpdated: hoursAgo(18),
    lastOutcome: "improved",
    recommendation: "Target Layer0/LayerZero protocols quarterly; prioritise L2 liquidity bridges",
    tags: ["partnerships", "cross-chain", "liquidity"],
  },
  {
    id: uuid(), name: "Emission Schedule Modulation",
    domain: "tokenomics", linkedAgent: "economy-agent",
    priority: "medium", successRate: 0.68, iterations: 7, lastUpdated: hoursAgo(20),
    lastOutcome: "degraded",
    recommendation: "Reduce emission 0.2%/month if staking ratio < 45%; re-evaluate monthly",
    tags: ["tokenomics", "emission", "staking"],
  },
  {
    id: uuid(), name: "Architecture Modular Sharding",
    domain: "architecture", linkedAgent: "architect-agent",
    priority: "high", successRate: 0.80, iterations: 3, lastUpdated: hoursAgo(48),
    lastOutcome: "stable",
    recommendation: "Isolate RPC, sequencer, and validator namespaces; enable per-shard auto-scale",
    tags: ["architecture", "sharding", "rpc"],
  },
];

// ── Internal Store ────────────────────────────────────────────────────────────

const _strategies: EvolvedStrategy[] = [...SEED_STRATEGIES];

// ── Helpers ───────────────────────────────────────────────────────────────────

function priorityFromRate(rate: number, current: Priority): Priority {
  if (rate >= 0.90) return "critical";
  if (rate >= 0.75) return "high";
  if (rate >= 0.55) return "medium";
  if (rate >= 0.35) return "low";
  if (current !== "archived") return "low";
  return "archived";
}

// ── Write ─────────────────────────────────────────────────────────────────────

export function evolveStrategy(
  strategyId: string,
  result: { success: boolean; successScore: number },
): EvolvedStrategy | null {
  const idx = _strategies.findIndex(s => s.id === strategyId);
  if (idx === -1) return null;

  const s         = _strategies[idx];
  const newRate   = (s.successRate * s.iterations + result.successScore) / (s.iterations + 1);
  const oldPrio   = s.priority;
  const newPrio   = priorityFromRate(newRate, s.priority);
  const outcome: EvolvedStrategy["lastOutcome"] =
    newRate > s.successRate + 0.02 ? "improved" :
    newRate < s.successRate - 0.02 ? "degraded" : "stable";

  _strategies[idx] = {
    ...s,
    successRate:  Math.round(newRate * 100) / 100,
    priority:     newPrio,
    iterations:   s.iterations + 1,
    lastUpdated:  Date.now(),
    lastOutcome:  outcome,
    recommendation: newPrio !== oldPrio
      ? `[Priority ${oldPrio}→${newPrio}] ${s.recommendation}`
      : s.recommendation,
  };

  return _strategies[idx];
}

export function runEvolutionCycle(insights: LearningInsight[]): void {
  // Apply learning insights to matching strategies
  for (const insight of insights) {
    for (const strategy of _strategies) {
      const domainMatch  = strategy.domain === insight.domain;
      const agentMatch   = strategy.linkedAgent === insight.agent;
      if (!domainMatch && !agentMatch) continue;

      // nudge successRate towards the insight's confidence
      const nudge = (insight.avgSuccessScore - strategy.successRate) * 0.15;
      const newRate = Math.max(0, Math.min(1, strategy.successRate + nudge));
      strategy.successRate = Math.round(newRate * 100) / 100;
      strategy.priority    = priorityFromRate(newRate, strategy.priority);
      strategy.lastUpdated = Date.now();
      if (Math.abs(nudge) > 0.02) {
        strategy.lastOutcome = nudge > 0 ? "improved" : "degraded";
      }
    }
  }
}

// ── Read ──────────────────────────────────────────────────────────────────────

export function getAllStrategies(): EvolvedStrategy[] {
  return [..._strategies].sort((a, b) => {
    const order: Priority[] = ["critical", "high", "medium", "low", "archived"];
    return order.indexOf(a.priority) - order.indexOf(b.priority);
  });
}

export function getStrategyById(id: string): EvolvedStrategy | undefined {
  return _strategies.find(s => s.id === id);
}

export function getStrategiesByDomain(domain: string): EvolvedStrategy[] {
  return _strategies.filter(s => s.domain === domain);
}

export function getStrategyStats(): {
  total: number;
  byPriority: Record<string, number>;
  avgSuccessRate: number;
} {
  const byPriority: Record<string, number> = {};
  let totalRate = 0;
  for (const s of _strategies) {
    byPriority[s.priority] = (byPriority[s.priority] ?? 0) + 1;
    totalRate += s.successRate;
  }
  return {
    total:          _strategies.length,
    byPriority,
    avgSuccessRate: Math.round((totalRate / (_strategies.length || 1)) * 100) / 100,
  };
}
