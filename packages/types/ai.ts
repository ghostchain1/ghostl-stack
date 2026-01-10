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

export interface SybilSignal {
  id: string;
  cluster: string;
  score: number;
  size: number;
  tags?: string[];
}

export interface ContractRisk {
  address: string;
  risk: number;
  notes?: string[];
}
