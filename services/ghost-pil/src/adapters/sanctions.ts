import { readFileSync } from 'fs';
import { config } from '../config';

export type SanctionsSignal = {
  jurisdictionCode: string;
  severity: string;
  confidence: number;
  detectedAt: string;
  summary: string;
  sourceRefs: string[];
};

export interface SanctionsAdapter {
  listSignals(): Promise<SanctionsSignal[]>;
}

export class StaticSanctionsAdapter implements SanctionsAdapter {
  async listSignals(): Promise<SanctionsSignal[]> {
    const raw = JSON.parse(readFileSync(config.PIL_LEGAL_SIGNALS_PATH, 'utf-8')) as { signals: any[] };
    return raw.signals
      .filter((signal) => String(signal.category || '').toUpperCase().includes('SANCTION'))
      .map((signal) => ({
        jurisdictionCode: signal.jurisdictionCode,
        severity: signal.severity,
        confidence: signal.confidence,
        detectedAt: signal.detectedAt,
        summary: signal.summary,
        sourceRefs: signal.sourceRefs || []
      }));
  }
}

export const buildSanctionsAdapter = (): SanctionsAdapter => new StaticSanctionsAdapter();
