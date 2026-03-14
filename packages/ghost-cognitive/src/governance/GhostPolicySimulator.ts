import type { GovernanceProposal, PolicySimulationResult } from '../types.js';

/**
 * GhostPolicySimulator — runs a pre-vote sandbox evaluation of governance policies
 * to surface risk before on-chain execution.
 *
 * Estimates impact and risk using the proposal's cost/benefit fields and category
 * heuristics. In production this would call a dedicated simulation service.
 */
export class GhostPolicySimulator {
  simulate(policy: GovernanceProposal): PolicySimulationResult {
    const ratio = policy.benefit / Math.max(policy.cost, 0.001);
    const notes: string[] = [];

    // Impact
    const impact: PolicySimulationResult['impact'] =
      ratio >= 1.2 ? 'positive' : ratio >= 0.8 ? 'neutral' : 'negative';

    // Risk heuristics based on category
    let risk: PolicySimulationResult['risk'] = 'low';
    if (policy.cost > 100_000) { risk = 'high'; notes.push('High absolute cost'); }
    else if (policy.cost > 10_000) { risk = 'medium'; notes.push('Moderate cost'); }

    if (policy.category === 'validator-set') {
      notes.push('Validator set changes may affect consensus stability during transition');
      if (risk === 'low') risk = 'medium';
    }
    if (policy.category === 'fee-parameter') {
      notes.push('Fee changes affect all users — monitor mempool post-activation');
    }
    if (policy.category === 'treasury') {
      notes.push('Treasury policy directly affects runway and validator incentives');
    }

    const recommendation: PolicySimulationResult['recommendation'] =
      impact === 'positive' && risk !== 'high' ? 'approve' :
      impact === 'negative' ? 'reject' : 'amend';

    return {
      impact,
      risk,
      estimatedCost: policy.cost,
      estimatedBenefit: policy.benefit,
      recommendation,
      notes,
    };
  }
}
