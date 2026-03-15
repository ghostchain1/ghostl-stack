/**
 * GovernanceSimulator — models voting outcomes and proposal impacts.
 */
export interface VoteSimResult {
  totalVoters:     number;
  predictedYes:    number;
  predictedNo:     number;
  predictedPass:   boolean;
  quorumReached:   boolean;
  recommendation:  string;
}

export class GovernanceSimulator {
  simulateVote(
    totalVoters: number,
    options: { yesRate?: number; quorumThreshold?: number } = {}
  ): VoteSimResult {
    const { yesRate = 0.62, quorumThreshold = 0.4 } = options;

    const participating  = Math.floor(totalVoters * (quorumThreshold + Math.random() * 0.2));
    const predictedYes   = Math.floor(participating * yesRate);
    const predictedNo    = participating - predictedYes;
    const quorumReached  = participating >= totalVoters * quorumThreshold;
    const predictedPass  = quorumReached && predictedYes > participating / 2;

    return {
      totalVoters,
      predictedYes,
      predictedNo,
      predictedPass,
      quorumReached,
      recommendation: predictedPass ? "proceed_with_proposal" : "build_more_consensus",
    };
  }

  simulateProtocolUpgrade(complexity: number): { riskScore: number; rolloutStrategy: string } {
    return {
      riskScore:      Math.min(complexity * 10, 100),
      rolloutStrategy: complexity > 5 ? "phased_rollout_with_canary" : "direct_upgrade",
    };
  }
}
