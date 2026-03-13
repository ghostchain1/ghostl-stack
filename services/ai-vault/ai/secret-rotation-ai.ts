/**
 * GhostStack AI Vault — Secret Rotation AI
 * AI-driven autonomous rotation engine. Decides WHEN and WHAT to rotate
 * based on risk signals, time policies, anomaly feedback, and actor
 * behavior patterns.
 *
 * Rotation priority order (highest risk first):
 *   1. Active threat / compromise signal → immediate
 *   2. High anomaly score → early rotation
 *   3. Scheduled expiry approaching → pre-emptive rotation
 *   4. Routine policy schedule → normal rotation
 *
 * GhostChain L1 (14000101) | L2 (901) | L3 (903) | GST gas token
 */

import type { AnomalySignal } from './anomaly-detector.js';
import type { RiskAssessment } from './risk-analyzer.js';
import type { ThreatPrediction } from './threat-predictor.js';

// ── Types ──────────────────────────────────────────────────────────────────

export type RotationReason =
  | 'scheduled'
  | 'risk_elevated'
  | 'threat_detected'
  | 'compromise_signal'
  | 'expiry_approaching'
  | 'policy_override'
  | 'manual';

export type RotationUrgency = 'routine' | 'elevated' | 'urgent' | 'emergency';

export interface RotationDecision {
  path: string;           // vault:// path of the secret/key
  shouldRotate: boolean;
  urgency: RotationUrgency;
  reason: RotationReason;
  scheduledAt: number;    // unix ms — when to perform rotation
  riskScore: number;      // 0–1 risk that drove the decision
  evidence: string[];
}

export interface RotationPolicy {
  path: string;
  intervalMs: number;     // normal scheduled interval
  maxAgeMs?: number;      // hard maximum age (forced rotation)
  riskThresholdEarly: number;  // risk score to trigger early rotation
}

export interface RotationRecord {
  path: string;
  lastRotatedAt: number;
  rotationCount: number;
  lastReason: RotationReason;
  lastUrgency: RotationUrgency;
}

// ── Default Rotation Policies ──────────────────────────────────────────────

export const DEFAULT_ROTATION_POLICIES: RotationPolicy[] = [
  {
    path: 'vault://jwt/**',
    intervalMs: 24 * 60 * 60 * 1000,          // 24 h
    maxAgeMs:   48 * 60 * 60 * 1000,
    riskThresholdEarly: 0.5,
  },
  {
    path: 'vault://api/**',
    intervalMs: 7 * 24 * 60 * 60 * 1000,      // 7 days
    maxAgeMs:   14 * 24 * 60 * 60 * 1000,
    riskThresholdEarly: 0.55,
  },
  {
    path: 'vault://docker/**',
    intervalMs: 7 * 24 * 60 * 60 * 1000,
    maxAgeMs:   14 * 24 * 60 * 60 * 1000,
    riskThresholdEarly: 0.5,
  },
  {
    path: 'vault://validator/**',
    intervalMs: 12 * 60 * 60 * 1000,          // 12 h
    maxAgeMs:   24 * 60 * 60 * 1000,
    riskThresholdEarly: 0.4,
  },
  {
    path: 'vault://bridge/**',
    intervalMs: 12 * 60 * 60 * 1000,
    maxAgeMs:   24 * 60 * 60 * 1000,
    riskThresholdEarly: 0.4,
  },
  {
    path: 'vault://treasury/**',
    intervalMs: 6 * 60 * 60 * 1000,           // 6 h  
    maxAgeMs:   12 * 60 * 60 * 1000,
    riskThresholdEarly: 0.3,
  },
  {
    path: 'vault://dns/**',
    intervalMs: 30 * 24 * 60 * 60 * 1000,     // 30 days
    maxAgeMs:   60 * 24 * 60 * 60 * 1000,
    riskThresholdEarly: 0.6,
  },
  {
    path: 'vault://ssh/**',
    intervalMs: 30 * 24 * 60 * 60 * 1000,
    maxAgeMs:   60 * 24 * 60 * 60 * 1000,
    riskThresholdEarly: 0.55,
  },
  {
    path: 'vault://ssl/**',
    intervalMs: 60 * 24 * 60 * 60 * 1000,     // 60 days
    maxAgeMs:   90 * 24 * 60 * 60 * 1000,
    riskThresholdEarly: 0.65,
  },
  {
    path: 'vault://github/**',
    intervalMs: 30 * 24 * 60 * 60 * 1000,
    maxAgeMs:   90 * 24 * 60 * 60 * 1000,
    riskThresholdEarly: 0.5,
  },
];

// Urgency bands → delay multiplier applied to scheduled time
const URGENCY_DELAY_MS: Record<RotationUrgency, number> = {
  emergency: 0,
  urgent:    60_000,          // 1 min
  elevated:  5 * 60_000,     // 5 min
  routine:   0,               // scheduled time unchanged
};

// ── SecretRotationAI ───────────────────────────────────────────────────────

export class SecretRotationAI {
  private readonly _policies: RotationPolicy[];
  private readonly _records  = new Map<string, RotationRecord>();

  constructor(overridePolicies?: RotationPolicy[]) {
    this._policies = overridePolicies ?? DEFAULT_ROTATION_POLICIES;
  }

  // ── Public API ─────────────────────────────────────────────────────────────

  /**
   * Evaluate a secret/key path and decide if rotation is warranted.
   * Considers risk assessments, threat predictions, anomaly signals,
   * and existing rotation records.
   */
  evaluate(
    path: string,
    context: {
      lastRotatedAt: number;
      riskAssessment?: RiskAssessment;
      threats?: ThreatPrediction[];
      anomalies?: AnomalySignal[];
    }
  ): RotationDecision {
    const now = Date.now();
    const policy = this._matchPolicy(path);
    const record = this._records.get(path);
    const evidence: string[] = [];

    // ── Threat signal (highest priority) ──────────────────────────────────
    const activeThreat = context.threats?.find(
      t => t.confidence > 0.8 && t.recommendedAction !== 'monitor'
    );
    if (activeThreat) {
      evidence.push(`Active threat: ${activeThreat.threatType} (confidence ${activeThreat.confidence.toFixed(2)})`);
      return this._decision(path, true, 'compromise_signal', 'emergency', now, activeThreat.confidence, evidence);
    }

    const risk = context.riskAssessment?.overallScore ?? 0;

    // ── Compromise detection ───────────────────────────────────────────────
    const compromiseSignal = context.anomalies?.some(
      a => ['validator_key_abuse', 'treasury_drain_pattern'].includes(a.type) && a.score > 0.85
    );
    if (compromiseSignal) {
      evidence.push('Critical anomaly signal detected: possible compromise');
      return this._decision(path, true, 'compromise_signal', 'emergency', now, risk, evidence);
    }

    if (!policy) {
      // No policy — decide based purely on risk
      if (risk >= 0.7) {
        evidence.push(`No policy; elevated risk ${risk.toFixed(2)} triggers rotation`);
        return this._decision(path, true, 'risk_elevated', 'urgent', now + URGENCY_DELAY_MS.urgent, risk, evidence);
      }
      return this._decision(path, false, 'scheduled', 'routine', now, risk, evidence);
    }

    const age = now - context.lastRotatedAt;
    const rotationCount = record?.rotationCount ?? 0;

    // ── Hard maximum age override ──────────────────────────────────────────
    if (policy.maxAgeMs && age >= policy.maxAgeMs) {
      evidence.push(`Max age exceeded: ${Math.round(age / 3_600_000)}h ≥ maxAge ${Math.round(policy.maxAgeMs / 3_600_000)}h`);
      return this._decision(path, true, 'expiry_approaching', 'urgent', now + URGENCY_DELAY_MS.urgent, risk, evidence);
    }

    // ── Risk-driven early rotation ─────────────────────────────────────────
    if (risk >= (policy.riskThresholdEarly ?? 0.6)) {
      const urgency: RotationUrgency = risk >= 0.85 ? 'urgent' : 'elevated';
      evidence.push(`Risk score ${risk.toFixed(2)} exceeds threshold ${policy.riskThresholdEarly}`);
      if (context.anomalies?.length) {
        evidence.push(`${context.anomalies.length} active anomaly signal(s)`);
      }
      return this._decision(path, true, 'risk_elevated', urgency, now + URGENCY_DELAY_MS[urgency], risk, evidence);
    }

    // ── Expiry approaching (80% of interval elapsed) ───────────────────────
    const approachingExpiry = age >= policy.intervalMs * 0.8;
    if (approachingExpiry) {
      evidence.push(`Expiry approaching: ${Math.round(age / 3_600_000)}h elapsed of ${Math.round(policy.intervalMs / 3_600_000)}h interval`);
      return this._decision(path, true, 'expiry_approaching', 'routine',
        context.lastRotatedAt + policy.intervalMs, risk, evidence);
    }

    // ── Scheduled rotation due ─────────────────────────────────────────────
    if (age >= policy.intervalMs) {
      evidence.push(`Scheduled rotation due (age ${Math.round(age / 3_600_000)}h, rotations: ${rotationCount})`);
      return this._decision(path, true, 'scheduled', 'routine', now, risk, evidence);
    }

    // ── No rotation needed ─────────────────────────────────────────────────
    const nextAt = context.lastRotatedAt + policy.intervalMs;
    evidence.push(`Next scheduled rotation in ${Math.round((nextAt - now) / 60_000)} min`);
    return this._decision(path, false, 'scheduled', 'routine', nextAt, risk, evidence);
  }

  /**
   * Batch evaluate multiple paths and return only those that should rotate,
   * sorted by urgency (emergency first).
   */
  evaluateBatch(
    items: Array<{
      path: string;
      lastRotatedAt: number;
      riskAssessment?: RiskAssessment;
      threats?: ThreatPrediction[];
      anomalies?: AnomalySignal[];
    }>
  ): RotationDecision[] {
    const urgencyOrder: Record<RotationUrgency, number> = {
      emergency: 0, urgent: 1, elevated: 2, routine: 3,
    };
    return items
      .map(item => this.evaluate(item.path, item))
      .filter(d => d.shouldRotate)
      .sort((a, b) => urgencyOrder[a.urgency]! - urgencyOrder[b.urgency]!);
  }

  /**
   * Record that a rotation was completed for adaptive learning.
   */
  recordRotation(path: string, reason: RotationReason, urgency: RotationUrgency): void {
    const existing = this._records.get(path);
    this._records.set(path, {
      path,
      lastRotatedAt:  Date.now(),
      rotationCount:  (existing?.rotationCount ?? 0) + 1,
      lastReason:     reason,
      lastUrgency:    urgency,
    });
  }

  /**
   * Return rotation history for a path.
   */
  getRecord(path: string): RotationRecord | undefined {
    return this._records.get(path);
  }

  /**
   * Add or override a rotation policy.
   */
  addPolicy(policy: RotationPolicy): void {
    const i = this._policies.findIndex(p => p.path === policy.path);
    if (i >= 0) {
      this._policies[i] = policy;
    } else {
      this._policies.push(policy);
    }
  }

  // ── Internal Helpers ───────────────────────────────────────────────────────

  private _matchPolicy(path: string): RotationPolicy | undefined {
    // Longest matching prefix wins (glob-lite: ** = anything)
    let bestMatch: RotationPolicy | undefined;
    let bestLen = -1;

    for (const policy of this._policies) {
      const pattern = policy.path.replace(/\*\*/g, '.*').replace(/\*/g, '[^/]*');
      const re = new RegExp(`^${pattern}$`);
      if (re.test(path)) {
        const len = policy.path.replace('**', '').replace('*', '').length;
        if (len > bestLen) {
          bestLen = len;
          bestMatch = policy;
        }
      }
    }
    return bestMatch;
  }

  private _decision(
    path: string,
    shouldRotate: boolean,
    reason: RotationReason,
    urgency: RotationUrgency,
    scheduledAt: number,
    riskScore: number,
    evidence: string[]
  ): RotationDecision {
    return { path, shouldRotate, urgency, reason, scheduledAt, riskScore, evidence };
  }
}
