import type { PolicyConfig } from "../config.js";
import { hashHex, merkleRoot } from "../determinism/canonical.js";
import type { TxDecision } from "../policy/scorer.js";
import type { TxFeatures } from "../policy/feature-extractor.js";

export type EvidencePackInput = {
  kind: string;
  subject: string;
  txHash: string;
  observedAt?: number;
  artifacts?: string[];
  validatorSetHash?: string;
  replayReference?: string;
};

export type EvidencePack = {
  evidenceId: string;
  kind: string;
  subject: string;
  txHash: string;
  observedAt: number;
  policyHash: string;
  modelHash: string;
  featureVectorHash: string;
  scoreHash: string;
  artifactsRoot: string;
  artifacts: string[];
  validatorSetHash: string;
  replayReference: string;
};

export const buildEvidencePack = (
  input: EvidencePackInput,
  features: TxFeatures,
  decision: TxDecision,
  policy: PolicyConfig
): EvidencePack => {
  const artifacts = [...(input.artifacts || [])].sort();
  const observedAt = input.observedAt && input.observedAt > 0 ? Math.floor(input.observedAt) : Date.now();

  const artifactsRoot = merkleRoot([
    ...artifacts,
    features.featureVectorHash,
    decision.scoreHash,
    policy.policyHash,
    policy.modelHash
  ]);

  const body = {
    kind: input.kind,
    subject: input.subject.toLowerCase(),
    txHash: input.txHash.toLowerCase(),
    observedAt,
    policyHash: policy.policyHash,
    modelHash: policy.modelHash,
    featureVectorHash: features.featureVectorHash,
    scoreHash: decision.scoreHash,
    artifactsRoot,
    validatorSetHash: (input.validatorSetHash || "").toLowerCase(),
    replayReference: input.replayReference || ""
  };

  return {
    ...body,
    evidenceId: hashHex(body),
    artifacts,
    validatorSetHash: body.validatorSetHash,
    replayReference: body.replayReference
  };
};
