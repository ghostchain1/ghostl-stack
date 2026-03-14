import type { Anomaly, Forecast } from '../../../../../packages/types';

export interface AnomalyDetectionService {
  getRecent(limit?: number): Promise<Anomaly[]>;
  watch(onAnomaly: (anomaly: Anomaly) => void): () => void;
}

export interface FraudScoringService {
  scoreWallet(address: string): Promise<{ score: number; reasons: string[] }>;
  scoreTransaction(hash: string): Promise<{ score: number; reasons: string[] }>;
}

export interface ForecastingService {
  getForecast(metric: string, horizon: string): Promise<Forecast>;
}

export interface ExplainabilityService {
  explain(entityId: string): Promise<{ reasons: string[]; contributingSignals: Record<string, number> }>;
}
