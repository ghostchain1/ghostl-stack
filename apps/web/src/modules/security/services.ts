import type { RiskSignal, KeyRef } from '@ghostl/types/security';

export interface SecretsHealth {
  sealed: boolean;
  latencyMs?: number;
  errors?: number;
  updatedAt?: string;
}

export interface SecretsHealthService {
  getHealth(): Promise<SecretsHealth>;
}

export interface KeyRotationService {
  listKeys(): Promise<KeyRef[]>;
  rotate(validatorId: string, type: KeyRef['type']): Promise<void>;
}

export interface SlashingDetectionService {
  listSignals(): Promise<RiskSignal[]>;
}

export type ComplianceFormat = 'csv' | 'json' | 'pdf';

export interface ComplianceExportService {
  export(format: ComplianceFormat): Promise<Blob | string>;
}
