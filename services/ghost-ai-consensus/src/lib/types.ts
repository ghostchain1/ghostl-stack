export type Layer = "L1" | "L2" | "L3";

export type TxCandidate = {
  hash: string;
  from: string;
  to: string;
  valueWei: string;
  gasLimit: number;
  maxFeePerGas: number;
  calldataHex?: string;
};

export type CascadingContext = {
  layer: Layer;
  parentL1Finalized?: boolean;
  parentL2Finalized?: boolean;
  parentL2AnchoredOnL1?: boolean;
  fraudWindowClosed?: boolean;
  policyHash?: string;
  expectedPolicyHash?: string;
  burnLogicEnforced?: boolean;
  canonicalL2Root?: string;
  parentL2Root?: string;
};

export type RiskClass = "normal" | "suspicious" | "requires_review" | "blocked";

export type ScoreResult = {
  riskScore: number;
  riskClass: RiskClass;
  accepted: boolean;
  quarantine: boolean;
  constraints: {
    maxGas: number;
    minFee: number;
    requireProof: boolean;
  };
  violations: string[];
  commitments: {
    featureHash: string;
    decisionHash: string;
  };
};
