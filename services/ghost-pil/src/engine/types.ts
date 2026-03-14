export type Decision = 'ALLOW' | 'WARN' | 'BLOCK' | 'REPORT';

export type DecisionInput = {
  requestId?: string;
  subject?: Record<string, unknown>;
  action: string;
  resource?: Record<string, unknown>;
  context?: Record<string, unknown>;
};

export type Jurisdiction = {
  code: string;
  name: string;
  region: string;
  riskTier: 'LOW' | 'MEDIUM' | 'HIGH' | 'EXTREME';
  regulatoryProfile: Record<string, unknown>;
};

export type LegalSignal = {
  id: string;
  jurisdictionCode: string;
  category: string;
  severity: string;
  confidence: number;
  detectedAt: string;
  summary: string;
  sourceRefs: unknown;
};

export type DecisionOutput = {
  decision: Decision;
  reasons: string[];
  jurisdictionApplied: string;
  policyPackId: string | null;
  explainabilityGraph: Record<string, unknown>;
  correlationId: string;
};
