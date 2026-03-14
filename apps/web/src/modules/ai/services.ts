import type { Anomaly, Forecast } from '@ghostl/types/ai';

export interface AnomalyDetectionService {
  list(): Promise<Anomaly[]>;
}

export interface FraudScoringService {
  score(entity: string): Promise<{ score: number; reasons: string[] }>;
}

export interface ForecastingService {
  list(): Promise<Forecast[]>;
}

export interface ExplainabilityService {
  explain(entity: string): Promise<string[]>;
}
