import type { PolicyConfig } from "../config.js";
import { hashHex } from "../determinism/canonical.js";
import type { TxFeatures } from "./feature-extractor.js";

export type RiskClass = "normal" | "suspicious" | "requires_review" | "blocked";

export type TxDecision = {
  riskScore: number;
  riskClass: RiskClass;
  constraints: {
    accepted: boolean;
    quarantine: boolean;
    maxGas: number;
    minFeePerGas: string;
    requiresEvidencePack: boolean;
  };
  priorityMicros: string;
  scoreHash: string;
};

const clamp = (value: number, min: number, max: number): number => {
  if (value < min) return min;
  if (value > max) return max;
  return value;
};

const classify = (riskScore: number): RiskClass => {
  if (riskScore >= 90) return "blocked";
  if (riskScore >= 70) return "requires_review";
  if (riskScore >= 40) return "suspicious";
  return "normal";
};

export const scoreFeatures = (features: TxFeatures, policy: PolicyConfig): TxDecision => {
  let riskScore = 5;

  if (features.isDenylisted) riskScore += 80;
  if (features.isSanctioned) riskScore += 40;
  if (features.hasExploitSignature) riskScore += 35;
  if (features.calldataBytes > 4096) riskScore += 10;
  if (features.gasLimit > policy.maxGasLimit) riskScore += 20;
  if (features.maxFeePerGas > policy.maxFeePerGas) riskScore += 15;
  if (features.valueWei > 10_000_000_000_000_000_000n) riskScore += 10;
  if (features.isAllowlisted) riskScore -= 10;

  riskScore = clamp(riskScore, 0, 100);

  const riskClass = classify(riskScore);

  const accepted = riskClass !== "blocked";
  const quarantine = riskClass === "requires_review";

  const feeMicros = features.maxFeePerGas * 1_000_000n;
  const penalty = (BigInt(riskScore) * BigInt(policy.riskPenaltyBps) * 1_000_000n) / 10_000n;
  const priorityMicros = feeMicros > penalty ? feeMicros - penalty : 0n;

  const constraints = {
    accepted,
    quarantine,
    maxGas: Math.min(features.gasLimit || policy.maxGasLimit, policy.maxGasLimit),
    minFeePerGas: (features.maxFeePerGas / 4n).toString(),
    requiresEvidencePack: quarantine || riskClass === "blocked"
  };

  const scoreHash = hashHex({
    txHash: features.txHash,
    riskScore,
    riskClass,
    constraints,
    policyHash: policy.policyHash,
    featureVectorHash: features.featureVectorHash,
    priorityMicros: priorityMicros.toString()
  });

  return {
    riskScore,
    riskClass,
    constraints,
    priorityMicros: priorityMicros.toString(),
    scoreHash
  };
};
