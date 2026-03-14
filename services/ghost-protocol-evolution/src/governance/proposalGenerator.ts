// proposalGenerator — builds a typed EvolutionProposal from a SimulationResult.
// Does not submit — submission is handled by proposalSubmitter.
import { randomUUID } from 'crypto';
import type { SimulationResult, EvolutionProposal, ImprovementType } from '../types.js';

function buildTitle(type: ImprovementType | string): string {
  switch (type) {
    case 'gas_optimization':      return 'Gas Optimisation Upgrade';
    case 'block_time_reduction':  return 'Block Interval Reduction Proposal';
    case 'validator_rebalancing': return 'Validator Load Rebalancing';
    case 'throughput_increase':   return 'Transaction Throughput Increase';
    default:                      return `Protocol Improvement: ${type}`;
  }
}

function buildDescription(sim: SimulationResult): string {
  return [
    sim.proposedChange,
    '',
    `Detected issue: ${sim.analysis.detail}`,
    `Simulation success rate: ${sim.successRate.toFixed(1)}%`,
    `Estimated improvement: ${sim.estimatedImprovementPct}%`,
    `Risk level: ${sim.riskLevel}`,
    '',
    'This proposal requires governance ratification before deployment.',
    'Validators must vote to approve — no autonomous deployment occurs.',
  ].join('\n');
}

export function generateProposal(sim: SimulationResult): EvolutionProposal {
  const type = sim.analysis.type ?? 'gas_optimization';
  const proposal: EvolutionProposal = {
    id: randomUUID(),
    title: buildTitle(type),
    description: buildDescription(sim),
    type,
    estimatedImprovementPct: sim.estimatedImprovementPct,
    riskLevel: sim.riskLevel,
    simulationId: sim.simulationId,
    triggerValue: sim.analysis.value,
    source: 'ghost-protocol-evolution',
    requiresGovernanceApproval: true,
    status: 'pending',
    createdAt: new Date().toISOString(),
  };

  console.info(`[proposalGenerator] generated proposal ${proposal.id}: "${proposal.title}"`);
  return proposal;
}
