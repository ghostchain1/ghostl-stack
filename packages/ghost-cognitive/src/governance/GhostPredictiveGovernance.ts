import type { GovernanceProposal } from '../types.js';

export type GovernanceVerdict = 'approve' | 'reject' | 'defer';

/**
 * GhostPredictiveGovernance — forecasts the outcome and advisability of governance
 * proposals by comparing estimated benefit against cost and risk.
 *
 * This layer acts as an AI pre-screener before proposals reach on-chain voting,
 * surfacing likely-to-fail proposals early and providing rationale.
 */
export class GhostPredictiveGovernance {
  private readonly costBenefitThreshold: number;

  constructor(opts: { costBenefitThreshold?: number } = {}) {
    this.costBenefitThreshold = opts.costBenefitThreshold ?? 1.0;
  }

  predict(proposal: GovernanceProposal): { verdict: GovernanceVerdict; confidence: number; rationale: string } {
    if (proposal.cost <= 0 && proposal.benefit > 0) {
      return { verdict: 'approve', confidence: 0.95, rationale: 'Zero cost with positive benefit' };
    }

    if (proposal.benefit <= 0) {
      return { verdict: 'reject', confidence: 0.9, rationale: 'No measurable benefit identified' };
    }

    const ratio = proposal.benefit / Math.max(proposal.cost, 0.001);

    if (ratio >= this.costBenefitThreshold * 1.5) {
      return { verdict: 'approve', confidence: Math.min(0.95, 0.6 + ratio * 0.1), rationale: `Benefit/cost ratio ${ratio.toFixed(2)} exceeds threshold` };
    }

    if (ratio >= this.costBenefitThreshold) {
      return { verdict: 'approve', confidence: 0.6, rationale: `Marginal approval — B/C ratio ${ratio.toFixed(2)}` };
    }

    if (ratio >= this.costBenefitThreshold * 0.5) {
      return { verdict: 'defer', confidence: 0.55, rationale: `B/C ratio ${ratio.toFixed(2)} below threshold; consider amending` };
    }

    return { verdict: 'reject', confidence: 0.8, rationale: `Cost exceeds benefit by ${((1 - ratio) * 100).toFixed(0)} %` };
  }
}
