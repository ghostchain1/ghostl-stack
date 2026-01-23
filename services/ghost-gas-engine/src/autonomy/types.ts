export type AutonomyMode =
  | 'OBSERVE_ONLY'
  | 'ADVISORY'
  | 'ASSISTED'
  | 'AUTONOMOUS'
  | 'AUTONOMOUS_STRICT'
  | 'DRY_RUN';

export type AutonomyAction = 'submit' | 'abort' | 'needs_approval' | 'observe_only';

export type AutonomyDecisionStatus = 'pending' | 'approved' | 'executed' | 'blocked';

export type AutonomyDecision = {
  id: string;
  deploymentId?: string | null;
  chainKey: string;
  mode: AutonomyMode;
  action: AutonomyAction;
  status: AutonomyDecisionStatus;
  riskScore: number;
  predictedSuccess: number;
  predictedGasUsed?: number | null;
  selectedGasLimit?: number | null;
  selectedMaxRetries?: number | null;
  rationale: Record<string, unknown>;
  confidence: number;
  createdAt: string;
};

export type AutonomyOverrides = {
  enabled?: boolean | null;
  mode?: AutonomyMode | null;
  maxRisk?: number | null;
  maxGasLimit?: number | null;
  maxRetries?: number | null;
  policyLock?: boolean | null;
  createdAt?: string | null;
};

export type AutonomyFeatures = {
  failureRate: number;
  outOfGasRate: number;
  congestion: number;
  avgGasUsed: number;
  avgEstimate: number;
  retriesPerDeployment: number;
};

export type AutonomyForecast = {
  id: string;
  chainKey: string;
  riskScore: number;
  predictedFailureProbability: number;
  failureTypes: string[];
  confidence: number;
  features: AutonomyFeatures;
  createdAt: string;
};
