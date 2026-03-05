import type { Proposal } from '../types.js';

/**
 * GhostProposalAggregator — selects the highest-scored proposal from a set.
 *
 * When multiple nodes propose different actions for the same event (e.g. different
 * scale targets), the aggregator picks the one the swarm collectively scored highest.
 */
export class GhostProposalAggregator {
  /**
   * Return the proposal with the highest score.
   * Throws if the list is empty.
   */
  aggregate(proposals: Proposal[]): Proposal {
    if (proposals.length === 0) {
      throw new Error('GhostProposalAggregator: cannot aggregate empty proposal list');
    }
    return proposals.reduce((best, p) => (p.score > best.score ? p : best));
  }

  /**
   * Rank proposals descending by score, then return the top-N.
   */
  topN(proposals: Proposal[], n: number): Proposal[] {
    return [...proposals].sort((a, b) => b.score - a.score).slice(0, n);
  }

  /**
   * Filter proposals to only those with a positive vote, then aggregate.
   */
  aggregateApproved(proposals: Proposal[]): Proposal | undefined {
    const approved = proposals.filter(p => p.vote === 'yes');
    if (approved.length === 0) return undefined;
    return this.aggregate(approved);
  }
}
