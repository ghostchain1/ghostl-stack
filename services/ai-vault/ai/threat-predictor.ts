/**
 * GhostStack AI Vault — Threat Predictor
 * Forward-looking threat prediction using pattern correlation,
 * attack-chain awareness, and temporal sequence analysis.
 *
 * Detects attack progressions before they complete:
 *   Reconnaissance → Enumeration → Exfiltration
 *   Login → Privilege escalation → Key access
 *   Rate probe → Block → Evasion attempt
 *
 * GhostChain L1 (14000101) | L2 (901) | L3 (903) | GST gas token
 */

import type { AnomalySignal, AnomalyType } from './anomaly-detector.js';

// ── Types ──────────────────────────────────────────────────────────────────

export interface ThreatPrediction {
  actorId: string;
  threatType: ThreatType;
  confidence: number;    // 0–1
  stage: AttackStage;
  evidence: string[];
  timeToMaterialization?: number;  // estimated ms until threat materializes
  recommendedAction: ThreatAction;
  ts: number;
}

export type ThreatType =
  | 'credential_theft'
  | 'key_exfiltration'
  | 'validator_compromise'
  | 'treasury_attack'
  | 'bridge_manipulation'
  | 'insider_threat'
  | 'automated_attack'
  | 'distributed_attack'
  | 'privilege_escalation'
  | 'supply_chain_attack';

export type AttackStage =
  | 'reconnaissance'
  | 'enumeration'
  | 'access_attempt'
  | 'escalation'
  | 'exfiltration'
  | 'lateral_movement'
  | 'persistence';

export type ThreatAction =
  | 'monitor'
  | 'alert'
  | 'throttle'
  | 'block'
  | 'rotate_secrets'
  | 'revoke_credentials'
  | 'quarantine'
  | 'emergency_shutdown';

// ── Attack Sequence Definitions ────────────────────────────────────────────

interface AttackPattern {
  name: ThreatType;
  sequence: AnomalyType[];
  windowMs: number;
  confidence: number;
  stage: AttackStage;
  action: ThreatAction;
}

const ATTACK_PATTERNS: AttackPattern[] = [
  {
    name: 'credential_theft',
    sequence: ['repeated_failures', 'multi_ip_token'],
    windowMs: 300_000,   // 5 min
    confidence: 0.85,
    stage: 'access_attempt',
    action: 'block',
  },
  {
    name: 'key_exfiltration',
    sequence: ['scope_explosion', 'rate_exceeded'],
    windowMs: 120_000,   // 2 min
    confidence: 0.8,
    stage: 'exfiltration',
    action: 'rotate_secrets',
  },
  {
    name: 'validator_compromise',
    sequence: ['validator_key_abuse', 'unusual_time'],
    windowMs: 180_000,
    confidence: 0.9,
    stage: 'escalation',
    action: 'revoke_credentials',
  },
  {
    name: 'treasury_attack',
    sequence: ['treasury_drain_pattern', 'scope_explosion'],
    windowMs: 60_000,
    confidence: 0.95,
    stage: 'exfiltration',
    action: 'emergency_shutdown',
  },
  {
    name: 'automated_attack',
    sequence: ['burst_detected', 'repeated_failures', 'rate_exceeded'],
    windowMs: 60_000,
    confidence: 0.75,
    stage: 'access_attempt',
    action: 'throttle',
  },
  {
    name: 'insider_threat',
    sequence: ['unusual_time', 'scope_explosion', 'multi_ip_token'],
    windowMs: 600_000,   // 10 min
    confidence: 0.7,
    stage: 'lateral_movement',
    action: 'alert',
  },
  {
    name: 'privilege_escalation',
    sequence: ['repeated_failures', 'scope_explosion', 'rate_exceeded'],
    windowMs: 300_000,
    confidence: 0.8,
    stage: 'escalation',
    action: 'revoke_credentials',
  },
  {
    name: 'bridge_manipulation',
    sequence: ['validator_key_abuse', 'scope_explosion'],
    windowMs: 300_000,
    confidence: 0.85,
    stage: 'exfiltration',
    action: 'emergency_shutdown',
  },
];

// ── ThreatPredictor ────────────────────────────────────────────────────────

export class ThreatPredictor {
  // Per-actor signal history
  private readonly _signalHistory = new Map<string, Array<{ signal: AnomalySignal; ts: number }>>();
  private readonly _predictions: ThreatPrediction[] = [];
  private readonly _maxPredictions = 500;

  /**
   * Process a batch of anomaly signals and predict threats.
   */
  predict(actorId: string, signals: AnomalySignal[]): ThreatPrediction[] {
    // Update signal history
    this._updateHistory(actorId, signals);

    const history = this._signalHistory.get(actorId) ?? [];
    if (history.length === 0) return [];

    const predictions: ThreatPrediction[] = [];

    for (const pattern of ATTACK_PATTERNS) {
      const result = this._matchPattern(actorId, history, pattern);
      if (result) {
        predictions.push(result);
        this._record(result);
      }
    }

    // Sort by confidence descending
    return predictions.sort((a, b) => b.confidence - a.confidence);
  }

  // ── Pattern Matching ───────────────────────────────────────────────────────

  private _matchPattern(
    actorId: string,
    history: Array<{ signal: AnomalySignal; ts: number }>,
    pattern: AttackPattern,
  ): ThreatPrediction | null {
    const cutoff = Date.now() - pattern.windowMs;
    const recent = history.filter(h => h.ts >= cutoff);

    // Check how many pattern signals appear in recent history
    const matchedSignals: AnomalyType[] = [];
    for (const signalType of pattern.sequence) {
      if (recent.some(h => h.signal.type === signalType)) {
        matchedSignals.push(signalType);
      }
    }

    const matchRatio = matchedSignals.length / pattern.sequence.length;
    if (matchRatio < 0.5) return null; // require at least 50% sequence match

    const confidence = pattern.confidence * matchRatio;

    // More signals = closer to materialization
    const remainingSignals = pattern.sequence.length - matchedSignals.length;
    const timeToMaterialization = remainingSignals === 0
      ? undefined
      : remainingSignals * (pattern.windowMs / pattern.sequence.length);

    return {
      actorId,
      threatType:    pattern.name,
      confidence,
      stage:         pattern.stage,
      evidence:      matchedSignals.map(s => `signal:${s}`),
      ...(timeToMaterialization !== undefined && { timeToMaterialization }),
      recommendedAction: pattern.action,
      ts: Date.now(),
    };
  }

  // ── Query ──────────────────────────────────────────────────────────────────

  recentPredictions(limit = 50): ThreatPrediction[] {
    return this._predictions.slice(-limit);
  }

  predictionsForActor(actorId: string): ThreatPrediction[] {
    return this._predictions.filter(p => p.actorId === actorId);
  }

  highConfidencePredictions(minConfidence = 0.8): ThreatPrediction[] {
    return this._predictions.filter(p => p.confidence >= minConfidence);
  }

  // ── Private ────────────────────────────────────────────────────────────────

  private _updateHistory(actorId: string, signals: AnomalySignal[]): void {
    const list = this._signalHistory.get(actorId) ?? [];
    for (const sig of signals) {
      list.push({ signal: sig, ts: sig.ts });
    }
    // Keep last 200 signals per actor
    if (list.length > 200) list.splice(0, list.length - 200);
    this._signalHistory.set(actorId, list);
  }

  private _record(p: ThreatPrediction): void {
    this._predictions.push(p);
    if (this._predictions.length > this._maxPredictions) {
      this._predictions.splice(0, this._predictions.length - this._maxPredictions);
    }
  }
}
