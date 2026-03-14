import type { PolicyConfig } from "../config.js";
import { hashHex, stableStringify } from "../determinism/canonical.js";
import { extractFeatures, type TxCandidate } from "../policy/feature-extractor.js";
import { scoreFeatures } from "../policy/scorer.js";

export type ReplayEntry = {
  tx: TxCandidate;
  expectedScoreHash?: string;
};

export type ReplayResult = {
  replayHash: string;
  mismatches: string[];
  evaluated: number;
};

export const replayDeterminism = (entries: ReplayEntry[], policy: PolicyConfig): ReplayResult => {
  const mismatches: string[] = [];
  const outputs = entries.map((entry, index) => {
    const features = extractFeatures(entry.tx, policy);
    const decision = scoreFeatures(features, policy);
    if (entry.expectedScoreHash && entry.expectedScoreHash !== decision.scoreHash) {
      mismatches.push(`entry:${index}:expected=${entry.expectedScoreHash}:actual=${decision.scoreHash}`);
    }
    return {
      txHash: features.txHash,
      featureVectorHash: features.featureVectorHash,
      scoreHash: decision.scoreHash
    };
  });

  return {
    replayHash: hashHex(stableStringify({ outputs, policyHash: policy.policyHash })),
    mismatches,
    evaluated: outputs.length
  };
};
