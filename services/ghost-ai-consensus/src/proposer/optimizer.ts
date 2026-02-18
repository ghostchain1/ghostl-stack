import type { PolicyConfig } from "../config.js";
import { extractFeatures, type TxCandidate } from "../policy/feature-extractor.js";
import { scoreFeatures, type TxDecision } from "../policy/scorer.js";

export type ProposedTransaction = {
  tx: TxCandidate;
  decision: TxDecision;
  lane: "normal" | "quarantine";
};

export type ProposalResult = {
  selected: ProposedTransaction[];
  blocked: Array<{ txHash: string; riskScore: number }>;
  totalGas: number;
  policyHash: string;
};

const safeGas = (value: number | undefined): number => {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.floor(Number(value)));
};

export const buildProposedBlock = (
  txs: TxCandidate[],
  policy: PolicyConfig,
  maxBlockGas: number
): ProposalResult => {
  const maxGas = Math.max(0, Math.floor(maxBlockGas));

  const scored = txs.map((tx) => {
    const features = extractFeatures(tx, policy);
    const decision = scoreFeatures(features, policy);
    return { tx, features, decision };
  });

  const blocked = scored
    .filter((entry) => !entry.decision.constraints.accepted)
    .map((entry) => ({ txHash: entry.features.txHash, riskScore: entry.decision.riskScore }));

  const candidates = scored
    .filter((entry) => entry.decision.constraints.accepted)
    .sort((a, b) => {
      const priorityA = BigInt(a.decision.priorityMicros);
      const priorityB = BigInt(b.decision.priorityMicros);
      if (priorityA !== priorityB) return priorityA > priorityB ? -1 : 1;
      if (a.decision.riskScore !== b.decision.riskScore) return a.decision.riskScore - b.decision.riskScore;
      return a.features.txHash.localeCompare(b.features.txHash);
    });

  const selected: ProposedTransaction[] = [];
  let totalGas = 0;

  for (const candidate of candidates) {
    const gas = safeGas(candidate.tx.gasLimit);
    if (gas === 0) continue;
    if (totalGas + gas > maxGas) continue;

    totalGas += gas;
    selected.push({
      tx: candidate.tx,
      decision: candidate.decision,
      lane: candidate.decision.constraints.quarantine ? "quarantine" : "normal"
    });
  }

  return {
    selected,
    blocked,
    totalGas,
    policyHash: policy.policyHash
  };
};
