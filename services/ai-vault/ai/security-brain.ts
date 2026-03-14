/**
 * GhostStack AI Vault — Security Brain
 * Central AI orchestrator that integrates all AI signals into a unified
 * security decision pipeline. It is the "nervous system" of the vault.
 *
 * Signal flow:
 *   AccessEvent → AnomalyDetector → RiskAnalyzer → ThreatPredictor
 *        └──────────────────────────────────────────────────────→ SecurityBrain
 *                                                                    │
 *                                                          RotationDecision / ThreatAction
 *
 * GhostChain L1 (14000101) | L2 (901) | L3 (903) | GST gas token
 */

import { AnomalyDetector, type AnomalySignal } from './anomaly-detector.js';
import { type AccessEvent, AccessBehaviorModel } from './access-behavior-model.js';
import { RiskAnalyzer, type RiskAssessment } from './risk-analyzer.js';
import { ThreatPredictor, type ThreatPrediction, type ThreatAction } from './threat-predictor.js';
import { SecretRotationAI, type RotationDecision } from './secret-rotation-ai.js';

// ── Types ──────────────────────────────────────────────────────────────────

export interface SecurityEvent {
  actorId: string;
  resource: string;
  action: string;
  sourceIp?: string;
  success: boolean;
  riskContext?: Record<string, string | number>;
  ts: number;
}

export interface SecurityVerdict {
  allow: boolean;
  riskScore: number;
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
  anomalies: AnomalySignal[];
  threats: ThreatPrediction[];
  assessment: RiskAssessment | null;
  recommendedAction: ThreatAction;
  rotations: RotationDecision[];
  message: string;
}

export interface BrainStats {
  totalEvents: number;
  totalAnomalies: number;
  totalThreats: number;
  totalRotationsTriggered: number;
  criticalIncidents: number;
  lastUpdated: number;
}

// ── SecurityBrain ──────────────────────────────────────────────────────────

export class SecurityBrain {
  private readonly _anomalyDetector:    AnomalyDetector;
  private readonly _behaviorModel:      AccessBehaviorModel;
  private readonly _riskAnalyzer:       RiskAnalyzer;
  private readonly _threatPredictor:    ThreatPredictor;
  private readonly _rotationAI:         SecretRotationAI;

  // Runtime counters
  private _stats: BrainStats = {
    totalEvents: 0,
    totalAnomalies: 0,
    totalThreats: 0,
    totalRotationsTriggered: 0,
    criticalIncidents: 0,
    lastUpdated: Date.now(),
  };

  // Rotation registry: path → lastRotatedAt
  private readonly _rotationRegistry = new Map<string, number>();

  // Threat callbacks registered by agents
  private readonly _threatCallbacks: Array<(verdict: SecurityVerdict) => void> = [];

  constructor(
    anomalyDetector?: AnomalyDetector,
    behaviorModel?: AccessBehaviorModel,
    riskAnalyzer?: RiskAnalyzer,
    threatPredictor?: ThreatPredictor,
    rotationAI?: SecretRotationAI,
  ) {
    this._anomalyDetector = anomalyDetector ?? new AnomalyDetector();
    this._behaviorModel   = behaviorModel   ?? new AccessBehaviorModel();
    this._riskAnalyzer    = riskAnalyzer    ?? new RiskAnalyzer();
    this._threatPredictor = threatPredictor ?? new ThreatPredictor();
    this._rotationAI      = rotationAI      ?? new SecretRotationAI();
  }

  // ── Core Analysis Pipeline ─────────────────────────────────────────────────

  /**
   * Process an incoming security event through the full AI pipeline.
   * Returns a verdict that includes allow/deny, risk, threats, and rotations.
   */
  analyze(event: SecurityEvent): SecurityVerdict {
    this._stats.totalEvents++;
    this._stats.lastUpdated = Date.now();

    const accessEvent: AccessEvent = {
      timestamp:  event.ts,
      actorId:    event.actorId,
      actorType:  'unknown',
      resource:   event.resource,
      method:     event.action,
      sourceIp:   event.sourceIp ?? '0.0.0.0',
      result:     event.success ? 'success' : 'failure',
    };

    // 1. Behavior baseline
    this._behaviorModel.record(accessEvent);
    const deviation = this._behaviorModel.analyze(event.actorId, accessEvent);
    const isBlocked = this._anomalyDetector.isBlocked(event.actorId);

    if (isBlocked) {
      const verdict = this._blockedVerdict(event);
      this._dispatch(verdict);
      return verdict;
    }

    // 2. Anomaly detection
    const anomalies = this._anomalyDetector.analyze(accessEvent);
    if (anomalies.length) {
      this._stats.totalAnomalies += anomalies.length;
    }

    // 3. Risk scoring
    const allSignals = this._anomalyDetector.signalsByActor(event.actorId, 50);
    const assessment = this._riskAnalyzer.assess({
      actorId:           event.actorId,
      actorType:         'unknown',
      resource:          event.resource,
      anomalySignals:    allSignals,
      ...(deviation != null && { behaviorDeviation: deviation }),
      sourceIp:          event.sourceIp ?? '0.0.0.0',
      method:            event.action,
    });

    // 4. Threat prediction
    const threats = this._threatPredictor.predict(event.actorId, anomalies);
    if (threats.length) {
      this._stats.totalThreats += threats.length;
    }

    // 5. Rotation decisions
    const lastRotated = this._rotationRegistry.get(event.resource) ?? (Date.now() - 7 * 86_400_000);
    const rotationDecision = this._rotationAI.evaluate(event.resource, {
      lastRotatedAt: lastRotated,
      riskAssessment: assessment,
      threats,
      anomalies,
    });
    const rotations = rotationDecision.shouldRotate ? [rotationDecision] : [];
    if (rotations.length) {
      this._stats.totalRotationsTriggered++;
    }

    // 6. Determine recommended action (highest threat wins)
    const highestThreat = threats.reduce<ThreatPrediction | null>((best, t) => {
      if (!best || t.confidence > best.confidence) return t;
      return best;
    }, null);
    const recommendedAction: ThreatAction =
      assessment.level === 'critical'  ? 'quarantine' :
      assessment.level === 'high'      ? (highestThreat?.recommendedAction ?? 'alert') :
      assessment.level === 'medium'    ? 'alert' :
      'monitor';

    const allow = !isBlocked && assessment.level !== 'critical' && assessment.overallScore < 0.95;

    if (assessment.level === 'critical') {
      this._stats.criticalIncidents++;
    }

    const verdict: SecurityVerdict = {
      allow,
      riskScore:         assessment.overallScore,
      riskLevel:         assessment.level,
      anomalies,
      threats,
      assessment,
      recommendedAction,
      rotations,
      message: allow
        ? `Access allowed (risk ${assessment.level})`
        : `Access denied — ${assessment.level} risk`,
    };

    this._dispatch(verdict);
    return verdict;
  }

  /**
   * Record that a rotation was completed (updates registry + rotation AI).
   */
  recordRotation(path: string, reason: Parameters<SecretRotationAI['recordRotation']>[1], urgency: Parameters<SecretRotationAI['recordRotation']>[2]): void {
    this._rotationRegistry.set(path, Date.now());
    this._rotationAI.recordRotation(path, reason, urgency);
  }

  /**
   * Subscribe to high-severity verdicts (threats or critical events).
   */
  onThreat(cb: (verdict: SecurityVerdict) => void): void {
    this._threatCallbacks.push(cb);
  }

  /**
   * Return current stats snapshot.
   */
  stats(): Readonly<BrainStats> {
    return { ...this._stats };
  }

  /**
   * Evaluate a batch of resources for rotation without an immediate access event.
   * Used by the KeyRotationAgent periodic sweep.
   */
  evaluateRotations(
    items: Array<{ path: string; lastRotatedAt: number; riskScore?: number }>
  ): RotationDecision[] {
    return this._rotationAI.evaluateBatch(
      items.map(i => ({
        path: i.path,
        lastRotatedAt: i.lastRotatedAt,
        ...(i.riskScore !== undefined && {
          riskAssessment: {
            actorId:      'system',
            resource:     i.path,
            overallScore: i.riskScore,
            level:        (i.riskScore >= 0.85 ? 'critical' : i.riskScore >= 0.6 ? 'high' : i.riskScore >= 0.3 ? 'medium' : 'low') as RiskAssessment['level'],
            components:   [] as RiskAssessment['components'],
            recommendation: '',
            ts:           Date.now(),
          },
        }),
      }))
    );
  }

  // ── Internal ───────────────────────────────────────────────────────────────

  private _blockedVerdict(event: SecurityEvent): SecurityVerdict {
    return {
      allow: false,
      riskScore: 1.0,
      riskLevel: 'critical',
      anomalies: [],
      threats: [],
      assessment: null,
      recommendedAction: 'block',
      rotations: [],
      message: `Actor ${event.actorId} is currently blocked`,
    };
  }

  private _dispatch(verdict: SecurityVerdict): void {
    if (verdict.riskLevel === 'critical' || verdict.threats.length > 0) {
      for (const cb of this._threatCallbacks) {
        try { cb(verdict); } catch { /* non-fatal */ }
      }
    }
  }
}
