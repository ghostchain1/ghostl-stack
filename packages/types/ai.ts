export interface Anomaly {
  id: string;
  entity: string;
  score: number;
  reasons: string[];
  time: string;
}

export interface Forecast {
  metric: string;
  horizon: string;
  value: number;
  confidence: number;
}
