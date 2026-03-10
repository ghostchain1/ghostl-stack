// Global Learning Coordinator — aggregates AI insights from all regions,
// detects cross-region patterns, and distributes learned knowledge.
// In this service the coordinator is in-process; future versions may
// communicate with regional AI nodes via the signing relay or a dedicated bus.

import { randomUUID } from 'crypto';
import { API_BASE } from '../config/sinConfig.js';
import type { LearningEvent, LearningEventType } from '../types.js';

// In-process ring buffer shared across cycles
const _learningLog: LearningEvent[] = [];
const MAX_LOG = 300;

interface RegionSignal {
  regionId?:    string;
  anomalies?:   number;
  patternScore?: number;  // 0–1 novelty
  modelVersion?: string;
}

function emit(
  type: LearningEventType,
  regionId: string,
  description: string,
  confidence: number,
): LearningEvent {
  const event: LearningEvent = {
    id:          randomUUID(),
    type,
    regionId,
    description,
    confidence:  Math.round(confidence * 100) / 100,
    ts:          Date.now(),
  };
  _learningLog.push(event);
  if (_learningLog.length > MAX_LOG) _learningLog.shift();
  return event;
}

export async function coordinateLearning(): Promise<LearningEvent[]> {
  let signals: RegionSignal[] = [];

  try {
    const res = await fetch(`${API_BASE}/api/ghostbrain/learning/signals`, {
      signal: AbortSignal.timeout(6_000),
    });
    if (res.ok) signals = (await res.json()) as RegionSignal[];
  } catch {
    // API not available — synthesise from known regions
    signals = [
      { regionId: 'north-america', anomalies: 0, patternScore: 0.1 },
      { regionId: 'europe',        anomalies: 0, patternScore: 0.1 },
      { regionId: 'asia',          anomalies: 0, patternScore: 0.1 },
    ];
  }

  const newEvents: LearningEvent[] = [];

  for (const sig of signals) {
    const region = sig.regionId ?? 'global';

    // Anomaly flagging
    if ((sig.anomalies ?? 0) > 3) {
      newEvents.push(emit(
        'anomaly-flagged',
        region,
        `${sig.anomalies} anomalies detected in ${region} — flagging for cross-region pattern analysis`,
        0.80,
      ));
    }

    // Novel pattern discovery
    if ((sig.patternScore ?? 0) > 0.7) {
      newEvents.push(emit(
        'pattern-discovered',
        region,
        `High novelty pattern (score ${sig.patternScore?.toFixed(2)}) in ${region} — sharing insight globally`,
        sig.patternScore ?? 0.7,
      ));

      // Mark insight as shared to all regions
      newEvents.push(emit(
        'insight-shared',
        'global',
        `Pattern from ${region} propagated to all regional AI coordinators`,
        0.95,
      ));
    }

    // Model version tracking
    if (sig.modelVersion) {
      newEvents.push(emit(
        'model-updated',
        region,
        `Regional AI model version ${sig.modelVersion} registered in global coordinator`,
        0.99,
      ));
    }
  }

  return newEvents;
}

export function recentLearningEvents(limit = 50): LearningEvent[] {
  return _learningLog.slice(-limit);
}
