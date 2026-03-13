/**
 * GhostStack AI Vault — Risk Analyzer
 * Multi-signal risk scoring engine. Combines behavioral deviation,
 * anomaly signals, resource criticality, and actor reputation
 * into a single normalized risk score (0–1).
 *
 * Risk levels:
 *   0.0–0.3  = low      (normal)
 *   0.3–0.6  = medium   (elevated, monitor)
 *   0.6–0.85 = high     (alert, consider rotation)
 *   0.85–1.0 = critical (block, rotate, quarantine)
 *
 * GhostChain L1 (14000101) | L2 (901) | L3 (903) | GST gas token
 */

import type { AnomalySignal } from './anomaly-detector.js';
import type { DeviationReport } from './access-behavior-model.js';
import type { PolicyEngine } from '../core/policy-engine.js';

// ── Types ──────────────────────────────────────────────────────────────────

export type RiskLevel = 'low' | 'medium' | 'high' | 'critical';

export interface RiskAssessment {
  actorId: string;
  resource: string;
  overallScore: number;     // 0–1
  level: RiskLevel;
  components: RiskComponent[];
  recommendation: string;
  ts: number;
}

export interface RiskComponent {
  source: string;
  weight: number;
  rawScore: number;
  weightedScore: number;
  description: string;
}

// ── Weights ────────────────────────────────────────────────────────────────
// Must sum to 1.0

const WEIGHTS = {
  anomalySignals:      0.35,
  behaviorDeviation:   0.25,
  resourceCriticality: 0.20,
  actorReputation:     0.15,
  contextualFactors:   0.05,
} as const;

// ── Actor Reputation ───────────────────────────────────────────────────────

class ActorReputation {
  private readonly _scores = new Map<string, { incidents: number; lastScore: number; ts: number }>();

  record(actorId: string, newScore: number): void {
    const existing = this._scores.get(actorId) ?? { incidents: 0, lastScore: 0, ts: 0 };
    const incidents = newScore > 0.7 ? existing.incidents + 1 : Math.max(0, existing.incidents - 0.1);
    this._scores.set(actorId, { incidents, lastScore: newScore, ts: Date.now() });
  }

  /** Reputation score: higher = worse reputation. Range [0, 1]. */
  score(actorId: string): number {
    const r = this._scores.get(actorId);
    if (!r) return 0;
    // Decay: halve incident count every 24h
    const hoursElapsed = (Date.now() - r.ts) / 3_600_000;
    const decayedIncidents = r.incidents * Math.pow(0.5, hoursElapsed / 24);
    return Math.min(1, decayedIncidents / 20);  // 20 incidents = max rep score
  }
}

// ── RiskAnalyzer ────────────────────────────────────────────────────────────

export class RiskAnalyzer {
  private readonly _policy:     { classifyResource(r: string): 'critical' | 'high' | 'medium' | 'low' | 'unknown' };
  private readonly _reputation: ActorReputation;
  private readonly _history:    RiskAssessment[] = [];
  private readonly _maxHistory = 2000;

  private static readonly _fallbackPolicy = {
    classifyResource(r: string): 'critical' | 'high' | 'medium' | 'low' | 'unknown' {
      if (/\/(key|validator|treasury)/.test(r))        return 'critical';
      if (/\/(bridge|multisig|sequencer)/.test(r))     return 'high';
      if (/\/(docker|ci|github|hypervisor)/.test(r))  return 'medium';
      if (/\/(dns|ssh|ssl)/.test(r))                  return 'medium';
      return 'low';
    },
  };

  constructor(policy?: PolicyEngine) {
    this._policy     = policy ?? RiskAnalyzer._fallbackPolicy;
    this._reputation = new ActorReputation();
  }

  // ── Assess ─────────────────────────────────────────────────────────────────

  assess(opts: {
    actorId: string;
    actorType: string;
    resource: string;
    anomalySignals: AnomalySignal[];
    behaviorDeviation?: DeviationReport | null;
    sourceIp: string;
    method: string;
  }): RiskAssessment {
    const components: RiskComponent[] = [];

    // 1. Anomaly signals
    const anomalyRaw = opts.anomalySignals.length === 0
      ? 0
      : Math.min(1, opts.anomalySignals.reduce((acc, s) => acc + s.score, 0) / opts.anomalySignals.length * 1.5);

    components.push({
      source:        'anomaly_signals',
      weight:        WEIGHTS.anomalySignals,
      rawScore:      anomalyRaw,
      weightedScore: anomalyRaw * WEIGHTS.anomalySignals,
      description:   `${opts.anomalySignals.length} anomaly signal(s), max severity ${(opts.anomalySignals[0]?.score ?? 0).toFixed(2)}`,
    });

    // 2. Behavioral deviation
    const devRaw = opts.behaviorDeviation?.overallScore ?? 0;
    components.push({
      source:        'behavior_deviation',
      weight:        WEIGHTS.behaviorDeviation,
      rawScore:      devRaw,
      weightedScore: devRaw * WEIGHTS.behaviorDeviation,
      description:   opts.behaviorDeviation
        ? `${opts.behaviorDeviation.deviations.length} deviations from baseline`
        : 'No baseline available yet',
    });

    // 3. Resource criticality
    const criticality = this._policy.classifyResource(opts.resource);
    const critRaw = { critical: 0.9, high: 0.6, medium: 0.3, low: 0.1, unknown: 0.2 }[criticality];
    components.push({
      source:        'resource_criticality',
      weight:        WEIGHTS.resourceCriticality,
      rawScore:      critRaw,
      weightedScore: critRaw * WEIGHTS.resourceCriticality,
      description:   `Resource "${opts.resource}" classified as ${criticality}`,
    });

    // 4. Actor reputation
    const repRaw = this._reputation.score(opts.actorId);
    components.push({
      source:        'actor_reputation',
      weight:        WEIGHTS.actorReputation,
      rawScore:      repRaw,
      weightedScore: repRaw * WEIGHTS.actorReputation,
      description:   `Actor historical reputation score: ${repRaw.toFixed(2)}`,
    });

    // 5. Contextual factors
    const ctxRaw = this._contextRisk(opts.actorType, opts.resource, opts.method);
    components.push({
      source:        'contextual_factors',
      weight:        WEIGHTS.contextualFactors,
      rawScore:      ctxRaw,
      weightedScore: ctxRaw * WEIGHTS.contextualFactors,
      description:   `Actor type "${opts.actorType}" accessing ${opts.method} on resource type`,
    });

    // Aggregate
    const overallScore = Math.min(1, components.reduce((acc, c) => acc + c.weightedScore, 0));
    const level = this._scoreToLevel(overallScore);

    // Update actor reputation
    this._reputation.record(opts.actorId, overallScore);

    const assessment: RiskAssessment = {
      actorId:    opts.actorId,
      resource:   opts.resource,
      overallScore,
      level,
      components,
      recommendation: this._recommend(level, opts),
      ts: Date.now(),
    };

    this._record(assessment);
    return assessment;
  }

  // ── History & Stats ────────────────────────────────────────────────────────

  recentAssessments(limit = 100): RiskAssessment[] {
    return this._history.slice(-limit);
  }

  highRiskActors(minScore = 0.6): string[] {
    const seen = new Map<string, number>();
    for (const a of this._history) {
      if (a.overallScore >= minScore) {
        seen.set(a.actorId, Math.max(seen.get(a.actorId) ?? 0, a.overallScore));
      }
    }
    return [...seen.entries()].sort((a, b) => b[1] - a[1]).map(([id]) => id);
  }

  // ── Private ────────────────────────────────────────────────────────────────

  private _contextRisk(actorType: string, resource: string, method: string): number {
    let score = 0;
    // AI agents accessing key material = elevated
    if (actorType === 'ai-agent' && resource.includes('/key')) score += 0.3;
    // Unknown actor writing = higher risk
    if (actorType === 'unknown' && (method === 'POST' || method === 'PUT')) score += 0.5;
    // Docker/VM container accessing validator keys = suspicious
    if ((actorType === 'docker-container' || actorType === 'vm-hypervisor') && resource.includes('validator')) score += 0.4;
    return Math.min(1, score);
  }

  private _scoreToLevel(score: number): RiskLevel {
    if (score >= 0.85) return 'critical';
    if (score >= 0.6)  return 'high';
    if (score >= 0.3)  return 'medium';
    return 'low';
  }

  private _recommend(level: RiskLevel, opts: { actorId: string; resource: string }): string {
    switch (level) {
      case 'critical': return `BLOCK and rotate secrets at ${opts.resource}. Quarantine actor ${opts.actorId}.`;
      case 'high':     return `Alert human operators. Consider rotating ${opts.resource}.`;
      case 'medium':   return `Monitor actor ${opts.actorId} closely. Review audit logs.`;
      case 'low':      return 'Normal operation.';
    }
  }

  private _record(assessment: RiskAssessment): void {
    this._history.push(assessment);
    if (this._history.length > this._maxHistory) {
      this._history.splice(0, this._history.length - this._maxHistory);
    }
  }
}
