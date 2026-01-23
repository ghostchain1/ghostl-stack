export type AiCoreMode = 'OBSERVE_ONLY' | 'ADVISORY' | 'ASSISTED' | 'AUTONOMOUS' | 'AUTONOMOUS_STRICT';

export type AiCoreAction = 'ALLOW' | 'MODIFY' | 'RETRY' | 'DEFER' | 'BLOCK' | 'ESCALATE';

export type AiCoreObservation = {
  id: string;
  chainKey: string;
  blockNumber: number | null;
  gasLimit: number | null;
  gasUsed: number | null;
  baseFee: number | null;
  blockTime: string | null;
  rpcLatencyMs: number | null;
  rpcNamespace: string | null;
  success: boolean;
  errorMessage: string | null;
  createdAt: string;
};

export type AiCorePrediction = {
  id: string;
  chainKey: string;
  riskScore: number;
  predictedFailureProbability: number;
  confidence: number;
  timeHorizonSeconds: number;
  affectedSubsystem: string;
  recommendedAction: AiCoreAction;
  features: Record<string, unknown>;
  createdAt: string;
};

export type AiCoreDecision = {
  id: string;
  chainKey: string;
  mode: AiCoreMode;
  action: AiCoreAction;
  status: string;
  riskScore: number;
  confidence: number;
  forecastId?: string | null;
  deploymentId?: string | null;
  rationale: Record<string, unknown>;
  createdAt: string;
};

export type AiCoreActionRecord = {
  id: string;
  decisionId?: string | null;
  chainKey: string;
  actionType: string;
  status: string;
  payload: Record<string, unknown>;
  createdAt: string;
};

export type AiFailureFingerprint = {
  fingerprint: string;
  chainKey: string;
  classification: string;
  errorSignature: string;
  occurrences: number;
  firstSeen: string;
  lastSeen: string;
};

export type AiSuppressionRule = {
  id: string;
  fingerprint: string;
  chainKey: string;
  active: boolean;
  reason: string | null;
  createdAt: string;
};

export type AiRecoveryPlaybook = {
  id: string;
  title: string;
  description: string;
  steps: Record<string, unknown>;
  createdAt: string;
};

export type AiGovernanceRecommendation = {
  id: string;
  chainKey: string;
  category: string;
  severity: string;
  summary: string;
  recommendation: string;
  status: string;
  createdAt: string;
  updatedAt: string;
};

export type AiPolicyConstraints = {
  chainKey: string;
  maxRisk?: number | null;
  maxGasLimit?: number | null;
  maxRetries?: number | null;
  allowedActions?: AiCoreAction[] | null;
  createdAt?: string | null;
};
