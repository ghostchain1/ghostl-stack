import { hashObject } from "./determinism.js";
import type { CascadingContext, ScoreResult, TxCandidate } from "./types.js";

export type PolicyConfig = {
  modelHash: string;
  denylist: string[];
  allowlist: string[];
  maxFeePerGas: number;
  maxCalldataBytes: number;
  reviewThreshold: number;
  blockThreshold: number;
  riskPenaltyPerViolation: number;
};

export const buildPolicyConfig = (): PolicyConfig => {
  const denylist = String(process.env.AI_DENYLIST || "")
    .split(",")
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
  const allowlist = String(process.env.AI_ALLOWLIST || "")
    .split(",")
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);

  return {
    modelHash: process.env.AI_MODEL_HASH || "ghost-ai-consensus-model-v1",
    denylist,
    allowlist,
    maxFeePerGas: Number(process.env.AI_MAX_FEE_PER_GAS || 2_000_000_000),
    maxCalldataBytes: Number(process.env.AI_MAX_CALLDATA_BYTES || 8192),
    reviewThreshold: Number(process.env.AI_REVIEW_THRESHOLD || 65),
    blockThreshold: Number(process.env.AI_BLOCK_THRESHOLD || 90),
    riskPenaltyPerViolation: Number(process.env.AI_RISK_PENALTY_PER_VIOLATION || 20)
  };
};

const calldataBytes = (tx: TxCandidate): number => {
  const hex = tx.calldataHex || "0x";
  if (!hex.startsWith("0x") || hex.length < 2) return 0;
  return (hex.length - 2) / 2;
};

export const validateCascadingFinality = (context: CascadingContext): string[] => {
  const violations: string[] = [];

  if (context.layer === "L2") {
    if (!context.parentL1Finalized) violations.push("L2_NOT_FINALIZED_ON_L1");
  }

  if (context.layer === "L3") {
    if (!context.parentL2Finalized) violations.push("L3_NOT_FINALIZED_ON_L2");
    if (!context.parentL2AnchoredOnL1) violations.push("L2_PARENT_NOT_FINALIZED_ON_L1");
    if (context.parentL2Root && context.canonicalL2Root && context.parentL2Root !== context.canonicalL2Root) {
      violations.push("L3_PARENT_L2_DIVERGENCE");
    }
  }

  if (context.fraudWindowClosed === false) violations.push("FRAUD_WINDOW_OPEN");
  if (context.burnLogicEnforced === false) violations.push("BURN_LOGIC_NOT_ENFORCED");

  if (context.expectedPolicyHash && context.policyHash && context.expectedPolicyHash !== context.policyHash) {
    violations.push("POLICY_HASH_MISMATCH");
  }

  return violations;
};

export const scoreTransaction = (
  tx: TxCandidate,
  context: CascadingContext,
  policy: PolicyConfig,
  policyHash: string
): ScoreResult => {
  const to = tx.to.toLowerCase();
  const featureVector = {
    txHash: tx.hash,
    to,
    calldataBytes: calldataBytes(tx),
    valueWei: tx.valueWei,
    gasLimit: tx.gasLimit,
    maxFeePerGas: tx.maxFeePerGas,
    layer: context.layer,
    parentL1Finalized: context.parentL1Finalized ?? null,
    parentL2Finalized: context.parentL2Finalized ?? null,
    parentL2AnchoredOnL1: context.parentL2AnchoredOnL1 ?? null,
    policyHash: context.policyHash || null,
    expectedPolicyHash: context.expectedPolicyHash || null
  };

  let risk = 0;
  const violations = validateCascadingFinality(context);

  if (policy.denylist.includes(to)) {
    risk = 100;
    violations.push("DENYLIST_TARGET");
  } else {
    if (tx.maxFeePerGas > policy.maxFeePerGas) {
      risk += 10;
      violations.push("FEE_SPIKE");
    }
    if (featureVector.calldataBytes > policy.maxCalldataBytes) {
      risk += 10;
      violations.push("CALLDATA_ANOMALY");
    }
    if (!policy.allowlist.includes(to)) {
      risk += 5;
    }
    risk += violations.length * policy.riskPenaltyPerViolation;
    if (risk > 100) risk = 100;
  }

  let riskClass: ScoreResult["riskClass"] = "normal";
  if (risk >= policy.blockThreshold) riskClass = "blocked";
  else if (risk >= policy.reviewThreshold) riskClass = "requires_review";
  else if (risk >= 40) riskClass = "suspicious";

  const accepted = riskClass !== "blocked";
  const quarantine = riskClass === "requires_review" || riskClass === "suspicious";

  const decisionPayload = {
    policyHash,
    featureVector,
    risk,
    riskClass,
    accepted,
    quarantine,
    violations: [...new Set(violations)].sort()
  };

  return {
    riskScore: risk,
    riskClass,
    accepted,
    quarantine,
    constraints: {
      maxGas: quarantine ? Math.min(tx.gasLimit, 1_500_000) : tx.gasLimit,
      minFee: quarantine ? Math.max(tx.maxFeePerGas, Math.floor(policy.maxFeePerGas / 2)) : tx.maxFeePerGas,
      requireProof: quarantine
    },
    violations: [...new Set(violations)].sort(),
    commitments: {
      featureHash: hashObject(featureVector),
      decisionHash: hashObject(decisionPayload)
    }
  };
};
