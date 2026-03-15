/**
 * GCL — Experience Store
 * Records structured operational events (scaling, revenue, marketing,
 * infrastructure failures, etc.) for pattern analysis and learning.
 */

import { v4 as uuid } from "uuid";

export type ExperienceCategory =
  | "scaling"
  | "revenue"
  | "marketing"
  | "infrastructure"
  | "security"
  | "governance"
  | "deployment"
  | "recovery"
  | "partnership"
  | "tokenomics";

export interface Experience {
  id:          string;
  timestamp:   number;
  category:    ExperienceCategory;
  event:       string;     // short event label
  description: string;     // full context
  outcome:     "positive" | "negative" | "neutral";
  magnitude:   number;     // 0.0 – 1.0 how significant was this?
  linkedAgent?: string;    // which agent triggered it
  metadata:    Record<string, unknown>;
}

const MAX_EXPERIENCES = 10_000;
const _experiences: Experience[] = [];

// ── Seed ──────────────────────────────────────────────────────────────────────

const minsAgo  = (m: number) => Date.now() - m * 60_000;
const hoursAgo = (h: number) => Date.now() - h * 3_600_000;

const SEED_EXPERIENCES: Omit<Experience, "id">[] = [
  {
    timestamp: hoursAgo(1),  category: "scaling",
    event: "Node scale-out triggered", description: "Network load exceeded 80% threshold; +2 validator nodes deployed",
    outcome: "positive", magnitude: 0.85, linkedAgent: "operator-agent",
    metadata: { nodesAdded: 2, loadBefore: 88, loadAfter: 54, rpcLatencyMs: 120 },
  },
  {
    timestamp: hoursAgo(2),  category: "security",
    event: "DDoS attack blocked", description: "28,000 req/s inbound to RPC; rate-limiting activated; 3,200 IPs banned",
    outcome: "positive", magnitude: 0.95, linkedAgent: "defender-agent",
    metadata: { rps: 28000, ipsBanned: 3200, userImpact: "none" },
  },
  {
    timestamp: hoursAgo(4),  category: "marketing",
    event: "Developer grant programme launched", description: "Developer funnel stagnant; $200K pool created for Solidity/Rust devs",
    outcome: "positive", magnitude: 0.90, linkedAgent: "strategist-agent",
    metadata: { poolUSD: 200000, applicantsDay1: 47, projectedNew: 55 },
  },
  {
    timestamp: hoursAgo(6),  category: "revenue",
    event: "Token burn executed", description: "340K GST burned from buy-back queue; supply -0.034%",
    outcome: "positive", magnitude: 0.75, linkedAgent: "economy-agent",
    metadata: { amountBurned: 340000, priceImpact: 0.8, supplyDeltaPct: -0.034 },
  },
  {
    timestamp: hoursAgo(8),  category: "deployment",
    event: "Rollback: GhostL2 sequencer", description: "Error rate spiked post-deploy; canary gate triggered rollback",
    outcome: "negative", magnitude: 0.70, linkedAgent: "operator-agent",
    metadata: { rollbackTimeS: 92, errorRateBefore: 5.4, errorRateAfter: 0.2 },
  },
  {
    timestamp: hoursAgo(10), category: "governance",
    event: "GIP-047 passed: validator rewards +8%", description: "Validator exit risk eliminated by reward increase proposal",
    outcome: "positive", magnitude: 0.80, linkedAgent: "governance-agent",
    metadata: { voteYesPct: 74, rewardIncreasePct: 8, validatorsRetained: 14 },
  },
  {
    timestamp: hoursAgo(14), category: "infrastructure",
    event: "Node n3 disk auto-repair", description: "Disk at 97%; log cleanup freed 18 GB; node restored",
    outcome: "positive", magnitude: 0.60, linkedAgent: "infrastructure-agent",
    metadata: { diskBefore: 97, freedGB: 18, downtimeS: 0 },
  },
  {
    timestamp: hoursAgo(18), category: "partnership",
    event: "LayerZero partnership initiated", description: "Cross-chain liquidity expansion; MOU drafted; announcement in 14 days",
    outcome: "positive", magnitude: 0.85, linkedAgent: "strategist-agent",
    metadata: { partner: "LayerZero", estimatedLiquidityIncreasePct: 35 },
  },
  {
    timestamp: hoursAgo(20), category: "tokenomics",
    event: "Emission schedule adjusted -2.1%", description: "Inflation reduced from 4.2% to 3.8%; target achieved",
    outcome: "positive", magnitude: 0.65, linkedAgent: "economy-agent",
    metadata: { inflationBefore: 4.2, inflationAfter: 3.8, validatorImpact: "minimal" },
  },
  {
    timestamp: minsAgo(30),  category: "security",
    event: "Bridge contract deployment blocked", description: "Auditor detected reentrancy vulnerability; deployment halted",
    outcome: "positive", magnitude: 0.99, linkedAgent: "auditor-agent",
    metadata: { severity: "critical", fundsAtRisk: 0, fixEtaHours: 4 },
  },
];

export function seedExperiences(): void {
  for (const exp of SEED_EXPERIENCES) {
    _experiences.push({ id: uuid(), ...exp });
  }
}

// ── Write ─────────────────────────────────────────────────────────────────────

export function recordExperience(
  event:    Pick<Experience, "category" | "event" | "description" | "outcome" | "magnitude"> &
            Partial<Pick<Experience, "linkedAgent" | "metadata">>,
): Experience {
  const full: Experience = {
    id:        uuid(),
    timestamp: Date.now(),
    metadata:  {},
    ...event,
  };
  _experiences.push(full);
  if (_experiences.length > MAX_EXPERIENCES) _experiences.shift();
  return full;
}

// ── Read ──────────────────────────────────────────────────────────────────────

export function getAllExperiences(): Experience[] {
  return [..._experiences];
}

export function getExperiencesByCategory(cat: ExperienceCategory): Experience[] {
  return _experiences.filter(e => e.category === cat);
}

export function getPositiveExperiences(): Experience[] {
  return _experiences.filter(e => e.outcome === "positive" && e.magnitude >= 0.6);
}

export function getRecentExperiences(limit = 50): Experience[] {
  return [..._experiences].sort((a, b) => b.timestamp - a.timestamp).slice(0, limit);
}

export function getExperienceStats(): {
  total: number;
  positive: number;
  negative: number;
  neutral: number;
  avgMagnitude: number;
  categoryBreakdown: Record<string, number>;
} {
  const breakdown: Record<string, number> = {};
  let totalMag = 0;
  let pos = 0, neg = 0, neu = 0;

  for (const e of _experiences) {
    breakdown[e.category] = (breakdown[e.category] ?? 0) + 1;
    totalMag += e.magnitude;
    if (e.outcome === "positive") pos++;
    else if (e.outcome === "negative") neg++;
    else neu++;
  }

  return {
    total:             _experiences.length,
    positive:          pos,
    negative:          neg,
    neutral:           neu,
    avgMagnitude:      _experiences.length > 0
      ? Math.round((totalMag / _experiences.length) * 100) / 100
      : 0,
    categoryBreakdown: breakdown,
  };
}
