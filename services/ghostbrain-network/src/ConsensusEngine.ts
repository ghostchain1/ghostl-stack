/**
 * ConsensusEngine — distributed AI consensus for GhostBrain network decisions.
 */
export interface ConsensusVote {
  nodeId:  string;
  vote:    "approve" | "reject";
  weight:  number;  // trust score
}

export interface ConsensusResult {
  passed:          boolean;
  totalWeight:     number;
  approvalWeight:  number;
  threshold:       number;
}

export class ConsensusEngine {
  vote(votes: ConsensusVote[], threshold = 0.5): ConsensusResult {
    const totalWeight    = votes.reduce((sum, v) => sum + v.weight, 0);
    const approvalWeight = votes
      .filter(v => v.vote === "approve")
      .reduce((sum, v) => sum + v.weight, 0);

    const ratio = totalWeight > 0 ? approvalWeight / totalWeight : 0;

    return {
      passed:         ratio > threshold,
      totalWeight,
      approvalWeight,
      threshold,
    };
  }
}
