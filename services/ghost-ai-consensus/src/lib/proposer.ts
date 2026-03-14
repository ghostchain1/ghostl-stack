import type { CascadingContext, TxCandidate } from "./types.js";
import type { PolicyConfig } from "./policy.js";
import { scoreTransaction } from "./policy.js";

export type ProposalInput = {
  txs: TxCandidate[];
  contextByTxHash: Record<string, CascadingContext>;
  maxBlockGas: number;
};

export const buildProposal = (input: ProposalInput, policy: PolicyConfig, policyHash: string) => {
  const scored = input.txs.map((tx) => {
    const context = input.contextByTxHash[tx.hash] || ({ layer: "L2" } as CascadingContext);
    const score = scoreTransaction(tx, context, policy, policyHash);
    const riskPenalty = BigInt(score.riskScore * 1_000_000);
    const feeReward = BigInt(tx.maxFeePerGas) * BigInt(tx.gasLimit);
    const priority = feeReward - riskPenalty;
    return { tx, context, score, priority };
  });

  scored.sort((a, b) => {
    if (a.score.accepted !== b.score.accepted) return a.score.accepted ? -1 : 1;
    if (a.priority !== b.priority) return a.priority > b.priority ? -1 : 1;
    if (a.score.riskScore !== b.score.riskScore) return a.score.riskScore - b.score.riskScore;
    return a.tx.hash.localeCompare(b.tx.hash);
  });

  let usedGas = 0;
  const selected: Array<{ tx: TxCandidate; riskClass: string; riskScore: number; violations: string[] }> = [];

  for (const entry of scored) {
    if (!entry.score.accepted) continue;
    if (usedGas + entry.tx.gasLimit > input.maxBlockGas) continue;
    usedGas += entry.tx.gasLimit;
    selected.push({
      tx: entry.tx,
      riskClass: entry.score.riskClass,
      riskScore: entry.score.riskScore,
      violations: entry.score.violations
    });
  }

  return {
    selected,
    dropped: scored.length - selected.length,
    usedGas,
    maxBlockGas: input.maxBlockGas
  };
};
