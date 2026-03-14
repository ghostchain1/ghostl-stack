import type { Proposal, ConsensusResult } from '../types.js';

/**
 * GhostDecisionConsensus — simple majority-vote consensus for swarm-wide decisions.
 *
 * Proposals that receive strictly more than 50 % "yes" votes are considered passed.
 * Abstentions count toward the total but not toward the yes count, making them
 * effectively a soft "no".
 */
export class GhostDecisionConsensus {
  /**
   * Evaluate a set of proposals and return whether consensus was reached.
   *
   * @param proposals - Array of proposals, each carrying a vote field.
   * @returns ConsensusResult describing the outcome.
   */
  async decide(proposals: Proposal[]): Promise<ConsensusResult> {
    if (proposals.length === 0) {
      return { passed: false, yesVotes: 0, totalVotes: 0 };
    }

    const yesVotes = proposals.filter(p => p.vote === 'yes').length;
    const passed = yesVotes > proposals.length / 2;

    return {
      passed,
      yesVotes,
      totalVotes: proposals.length,
    };
  }

  /**
   * Quorum check — returns true only when at least `quorumPct` percent of the
   * expected node count has submitted a proposal.
   */
  hasQuorum(proposals: Proposal[], expectedNodes: number, quorumPct = 0.51): boolean {
    if (expectedNodes === 0) return false;
    return proposals.length / expectedNodes >= quorumPct;
  }
}
