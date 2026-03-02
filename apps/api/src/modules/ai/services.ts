// ---------------------------------------------------------------------------
// AI service interfaces & in-memory implementations
// ---------------------------------------------------------------------------

export interface AnomalyRecord {
  id: string;
  entity: string;
  score: number;
  reasons: string[];
  recordedAt: string;
}

export interface ForecastRecord {
  chain: string;
  horizonBlocks: number;
  avgGasPriceWei: string;
  congestion: 'LOW' | 'MEDIUM' | 'HIGH';
  avgTxPerBlock: number;
  recordedAt: string;
}

// ---- Interfaces -----------------------------------------------------------

export interface AnomalyDetectionService {
  getRecent(limit?: number): Promise<AnomalyRecord[]>;
  record(anomaly: Omit<AnomalyRecord, 'id' | 'recordedAt'>): void;
  watch(onAnomaly: (anomaly: AnomalyRecord) => void): () => void;
}

export interface FraudScoringService {
  scoreWallet(address: string, chain?: string): Promise<{ score: number; reasons: string[] }>;
  scoreTransaction(hash: string, chain?: string): Promise<{ score: number; reasons: string[] }>;
}

export interface ForecastingService {
  getForecast(chain: string): Promise<ForecastRecord | null>;
  record(forecast: Omit<ForecastRecord, 'recordedAt'>): void;
}

export interface ExplainabilityService {
  explain(entityId: string): Promise<{ reasons: string[]; contributingSignals: Record<string, number> }>;
}

// ---- Implementations -------------------------------------------------------

export class InMemoryAnomalyDetectionService implements AnomalyDetectionService {
  private readonly store: AnomalyRecord[] = [];
  private readonly maxCapacity: number;
  private readonly listeners: Array<(anomaly: AnomalyRecord) => void> = [];

  constructor(maxCapacity = 500) {
    this.maxCapacity = maxCapacity;
  }

  async getRecent(limit = 50): Promise<AnomalyRecord[]> {
    return this.store.slice(-Math.min(limit, this.store.length)).reverse();
  }

  record(anomaly: Omit<AnomalyRecord, 'id' | 'recordedAt'>): void {
    const record: AnomalyRecord = {
      ...anomaly,
      id: `anm_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      recordedAt: new Date().toISOString()
    };
    this.store.push(record);
    if (this.store.length > this.maxCapacity) this.store.shift();
    for (const listener of this.listeners) {
      try { listener(record); } catch { /* ignore listener errors */ }
    }
  }

  watch(onAnomaly: (anomaly: AnomalyRecord) => void): () => void {
    this.listeners.push(onAnomaly);
    return () => {
      const idx = this.listeners.indexOf(onAnomaly);
      if (idx !== -1) this.listeners.splice(idx, 1);
    };
  }
}

export class InMemoryForecastingService implements ForecastingService {
  private readonly store = new Map<string, ForecastRecord>();

  async getForecast(chain: string): Promise<ForecastRecord | null> {
    return this.store.get(chain) ?? null;
  }

  record(forecast: Omit<ForecastRecord, 'recordedAt'>): void {
    this.store.set(forecast.chain, { ...forecast, recordedAt: new Date().toISOString() });
  }
}

export class InMemoryExplainabilityService implements ExplainabilityService {
  async explain(entityId: string): Promise<{ reasons: string[]; contributingSignals: Record<string, number> }> {
    return {
      reasons: [`No stored explainability for ${entityId}`],
      contributingSignals: {}
    };
  }
}

// ---- Singleton registry ---------------------------------------------------

export class AiServiceRegistry {
  readonly anomalyDetection: AnomalyDetectionService;
  readonly forecasting: ForecastingService;
  readonly explainability: ExplainabilityService;

  constructor() {
    this.anomalyDetection = new InMemoryAnomalyDetectionService();
    this.forecasting = new InMemoryForecastingService();
    this.explainability = new InMemoryExplainabilityService();
  }
}

/** Process-wide singleton shared by the AI router and worker queue handler. */
export const aiRegistry = new AiServiceRegistry();
