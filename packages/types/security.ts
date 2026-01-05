export type RiskSeverity = 'low' | 'medium' | 'high' | 'critical';

export interface RiskSignal {
  source: string;
  severity: RiskSeverity;
  score: number;
  evidence: string;
  createdAt?: string;
}

export interface KeyRef {
  validatorId: string;
  type: 'validator' | 'proposer' | 'relayer' | 'other';
  rotatedAt?: string;
  expiresAt?: string;
}
