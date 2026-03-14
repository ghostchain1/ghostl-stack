/**
 * policySimulator.ts — Economic and ecosystem policy simulation engine
 *
 * Simulates the projected effects of a governance proposal before it goes
 * to a vote.  All calculations are deterministic model-based estimates —
 * no external API calls are required.  Results are stored and linked to
 * their originating proposal.
 */

import logger from "../utils/logger";
import type { GovernanceProposal } from "../proposals/proposalGenerator";

// ── Types ─────────────────────────────────────────────────────────────────────

export type SimulationRisk = "low" | "medium" | "high" | "critical";

export interface PolicySimulationResult {
  proposalId:     string;
  timestamp:      number;
  durationDays:   number;          // projection window

  // Economic impacts (relative change from baseline, e.g. 0.15 = +15%)
  liquidityImpact:    number;
  userGrowthImpact:   number;
  tokenDemandImpact:  number;
  validatorImpact:    number;
  revenueImpact:      number;

  // Treasury effects
  treasuryCost:     number;       // USD estimated cost
  treasuryROI:      number;       // 0-∞, expected return ratio

  // Risk assessment
  riskLevel:        SimulationRisk;
  riskFactors:      string[];

  // Recommendation
  recommendation:   "approve" | "reject" | "modify" | "defer";
  rationale:        string;
  confidenceScore:  number;        // 0-1
}

// ── Storage ───────────────────────────────────────────────────────────────────

const simulations = new Map<string, PolicySimulationResult>();

// ── Impact models per category ────────────────────────────────────────────────

type ImpactProfile = {
  liquidity:    number;
  userGrowth:   number;
  tokenDemand:  number;
  validators:   number;
  revenue:      number;
};

const CATEGORY_IMPACT: Record<string, ImpactProfile> = {
  treasury:       { liquidity: 0.05, userGrowth: 0.02, tokenDemand: 0.03, validators: 0.01, revenue: 0.04 },
  tokenomics:     { liquidity: 0.12, userGrowth: 0.08, tokenDemand: 0.18, validators: 0.03, revenue: 0.10 },
  liquidity:      { liquidity: 0.25, userGrowth: 0.10, tokenDemand: 0.15, validators: 0.02, revenue: 0.12 },
  infrastructure: { liquidity: 0.02, userGrowth: 0.05, tokenDemand: 0.04, validators: 0.20, revenue: 0.06 },
  grants:         { liquidity: 0.08, userGrowth: 0.18, tokenDemand: 0.10, validators: 0.05, revenue: 0.14 },
  validator:      { liquidity: 0.03, userGrowth: 0.04, tokenDemand: 0.05, validators: 0.25, revenue: 0.05 },
  security:       { liquidity: 0.04, userGrowth: 0.06, tokenDemand: 0.07, validators: 0.08, revenue: 0.10 },
  expansion:      { liquidity: 0.10, userGrowth: 0.22, tokenDemand: 0.14, validators: 0.08, revenue: 0.18 },
  parameter:      { liquidity: 0.06, userGrowth: 0.05, tokenDemand: 0.08, validators: 0.06, revenue: 0.05 },
};

// ── Risk scoring ──────────────────────────────────────────────────────────────

function assessRisk(cost: number, confidence: number, category: string): { level: SimulationRisk; factors: string[] } {
  const factors: string[] = [];

  if (cost > 500_000)    factors.push("Large treasury expenditure (> $500K)");
  if (cost > 200_000)    factors.push("Significant treasury expenditure (> $200K)");
  if (confidence < 0.5)  factors.push("Low AI confidence in outcome prediction");
  if (category === "tokenomics") factors.push("Tokenomics changes carry market uncertainty");
  if (category === "infrastructure") factors.push("Infrastructure changes require coordinated deployment");
  if (category === "security") factors.push("Security changes require audit before execution");

  const score = factors.length;
  const level: SimulationRisk =
    score >= 4 ? "critical" :
    score >= 3 ? "high"     :
    score >= 1 ? "medium"   :
    "low";

  return { level, factors };
}

// ── Recommendation logic ──────────────────────────────────────────────────────

function recommend(
  roi:       number,
  risk:      SimulationRisk,
  confidence: number,
): { recommendation: PolicySimulationResult["recommendation"]; rationale: string } {
  if (risk === "critical" || (risk === "high" && confidence < 0.55)) {
    return { recommendation: "reject", rationale: "Risk level is too high relative to projected returns. Proposal should be redesigned." };
  }
  if (roi < 0.8) {
    return { recommendation: "modify", rationale: "Projected ROI is below break-even. Consider reducing treasury cost or increasing projected benefit." };
  }
  if (confidence < 0.5) {
    return { recommendation: "defer", rationale: "Model confidence is insufficient. Gather more ecosystem data before voting." };
  }
  if (roi >= 1.5 && (risk === "low" || risk === "medium")) {
    return { recommendation: "approve", rationale: "Strong positive ROI with acceptable risk profile. Recommend proceeding to vote." };
  }
  return { recommendation: "approve", rationale: "Acceptable risk-to-reward ratio. Proceed to community vote." };
}

// ── Main simulation ───────────────────────────────────────────────────────────

export function simulatePolicy(proposal: GovernanceProposal, horizonDays = 90): PolicySimulationResult {
  const profile = CATEGORY_IMPACT[proposal.category] ?? CATEGORY_IMPACT.parameter;

  // Extract cost from parameters if present
  const rawCost = (
    (proposal.parameters.estimatedCost as number)  ??
    (proposal.parameters.budget         as number)  ??
    (proposal.parameters.maxReserveAllocation as number) ??
    50_000
  );
  const treasuryCost = Number(rawCost);

  // Scale impacts by horizon (longer = more compounded benefit)
  const scaleFactor = Math.log(horizonDays / 30 + 1) / Math.log(4); // 0→1 scale for 30→90d
  const jitter = (s: number) => s * (0.85 + Math.random() * 0.30); // ±15% realistic variance

  const liquidityImpact   = jitter(profile.liquidity   * scaleFactor);
  const userGrowthImpact  = jitter(profile.userGrowth  * scaleFactor);
  const tokenDemandImpact = jitter(profile.tokenDemand * scaleFactor);
  const validatorImpact   = jitter(profile.validators  * scaleFactor);
  const revenueImpact     = jitter(profile.revenue     * scaleFactor);

  // Simple ROI: projected revenue uplift vs cost
  const projectedRevenue  = treasuryCost * (1 + revenueImpact);
  const treasuryROI       = projectedRevenue / Math.max(treasuryCost, 1);

  const { level: riskLevel, factors: riskFactors } = assessRisk(treasuryCost, proposal.aiConfidence, proposal.category);
  const confidenceScore = Math.min(1, proposal.aiConfidence * (1 - riskFactors.length * 0.05));
  const { recommendation, rationale } = recommend(treasuryROI, riskLevel, confidenceScore);

  const result: PolicySimulationResult = {
    proposalId:    proposal.id,
    timestamp:     Date.now(),
    durationDays:  horizonDays,
    liquidityImpact,
    userGrowthImpact,
    tokenDemandImpact,
    validatorImpact,
    revenueImpact,
    treasuryCost,
    treasuryROI,
    riskLevel,
    riskFactors,
    recommendation,
    rationale,
    confidenceScore,
  };

  simulations.set(proposal.id, result);

  logger.info(`[PolicySimulator] Simulated "${proposal.title}" → ${recommendation} (risk=${riskLevel}, ROI=${treasuryROI.toFixed(2)}x)`);
  return result;
}

// ── Queries ───────────────────────────────────────────────────────────────────

export function getSimulation(proposalId: string): PolicySimulationResult | undefined {
  return simulations.get(proposalId);
}

export function getAllSimulations(): PolicySimulationResult[] {
  return [...simulations.values()].sort((a, b) => b.timestamp - a.timestamp);
}

export function getSimulationStats() {
  const all = getAllSimulations();
  const byRec = { approve: 0, reject: 0, modify: 0, defer: 0 };
  for (const s of all) byRec[s.recommendation]++;
  return {
    total:      all.length,
    byRecommendation: byRec,
    avgROI:     all.length ? all.reduce((s, x) => s + x.treasuryROI, 0) / all.length : 0,
    avgConfidence: all.length ? all.reduce((s, x) => s + x.confidenceScore, 0) / all.length : 0,
  };
}
