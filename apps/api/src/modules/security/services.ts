import type { KeyRef, RiskSignal } from '../../../../../packages/types';

export interface SecretsHealthService {
  getStatus(): Promise<{ sealed: boolean; latencyMs?: number; errorRate?: number }>;
}

export interface KeyRotationService {
  list(): Promise<KeyRef[]>;
  rotate(keyRef: KeyRef): Promise<KeyRef>;
}

export interface SlashingDetectionService {
  getRiskSignals(): Promise<RiskSignal[]>;
  subscribe(onSignal: (signal: RiskSignal) => void): () => void;
}

export type ComplianceFormat = 'csv' | 'json' | 'pdf';

export interface ComplianceExportService {
  exportReports(format: ComplianceFormat): Promise<Buffer>;
}
