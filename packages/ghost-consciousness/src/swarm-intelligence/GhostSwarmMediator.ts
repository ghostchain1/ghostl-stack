import type { SwarmVote, MediationResult } from '../types.js';

/**
 * GhostSwarmMediator — vote resolution and consensus calculation.
 *
 * Accepts a raw array of SwarmVotes (yes / no / abstain) from the Council
 * and decides the outcome using configurable quorum rules.
 *
 * Default rules:
 *  - Abstentions are excluded from percentage calculation
 *    (they count towards quorum but not towards yes/no ratio).
 *  - Simple majority (>50% yes of active votes) passes.
 *  - Ties resolve as rejection (status quo bias).
 *  - If all votes are abstain: no quorum → rejection.
 *
 * The mediator is intentionally stateless — it can be reused across
 * deliberations without side effects.
 */
export class GhostSwarmMediator {

  /**
   * Resolve a set of votes to a binary outcome.
   * @param votes — array of SwarmVote values from council members
   * @param majorityThreshold — fraction of active votes required (default 0.5)
   */
  resolve(votes: SwarmVote[], majorityThreshold = 0.5): MediationResult {
    if (votes.length === 0) {
      return this.buildResult(votes, false, 0, 'no_votes_cast');
    }

    const yes = votes.filter((v) => v === 'yes').length;
    const no = votes.filter((v) => v === 'no').length;
    const abstain = votes.filter((v) => v === 'abstain').length;
    const active = yes + no;

    if (active === 0) {
      return this.buildResult(votes, false, 0, 'all_abstained');
    }

    const consensus = yes / active;
    const outcome = consensus > majorityThreshold;

    const reasoning =
      `${yes} yes / ${no} no / ${abstain} abstain — ` +
      `consensus ${(consensus * 100).toFixed(1)}% ` +
      `(threshold ${(majorityThreshold * 100).toFixed(0)}%) → ${outcome ? 'PASSED' : 'REJECTED'}`;

    return this.buildResult(votes, outcome, consensus, reasoning);
  }

  /** Require a supermajority (2/3 by default) — useful for high-stakes issues. */
  resolveSupermajority(votes: SwarmVote[], threshold = 0.667): MediationResult {
    return this.resolve(votes, threshold);
  }

  /** Split a list of votes into tallies for reporting. */
  tally(votes: SwarmVote[]): { yes: number; no: number; abstain: number; total: number } {
    return {
      yes: votes.filter((v) => v === 'yes').length,
      no: votes.filter((v) => v === 'no').length,
      abstain: votes.filter((v) => v === 'abstain').length,
      total: votes.length,
    };
  }

  private buildResult(
    votes: SwarmVote[],
    outcome: boolean,
    consensus: number,
    reasoning: string,
  ): MediationResult {
    return { resolved: true, outcome, votes, consensus, reasoning };
  }
}
