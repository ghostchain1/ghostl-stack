/**
 * GhostStack AI Vault — Access Behavior Model
 * Establishes and maintains a behavioral baseline for each actor.
 * Detects deviations from normal access patterns.
 *
 * Model features per actor:
 *   - Access frequency (requests/minute, requests/hour)
 *   - Resource distribution (entropy over paths accessed)
 *   - Time-of-day pattern (hour distribution)
 *   - IP address consistency
 *   - Method distribution (GET vs POST vs other)
 *   - Burst patterns
 *
 * GhostChain L1 (14000101) | L2 (901) | L3 (903) | GST gas token
 */

// ── Types ──────────────────────────────────────────────────────────────────

export interface AccessEvent {
  timestamp: number;
  actorId: string;
  actorType: string;
  resource: string;
  method: string;
  sourceIp: string;
  result: 'success' | 'failure' | 'denied' | 'blocked';
  riskScore?: number;
}

export interface ActorBaseline {
  actorId: string;
  actorType: string;
  sampleCount: number;
  avgRequestsPerMin: number;
  stdRequestsPerMin: number;
  avgRequestsPerHour: number;
  resourceEntropy: number;          // Shannon entropy over resource paths
  hourDistribution: number[];       // histogram[0..23] normalized
  knownIps: Set<string>;
  methodDistribution: Record<string, number>;
  lastUpdated: number;
}

export interface DeviationReport {
  actorId: string;
  deviations: Deviation[];
  overallScore: number;   // 0–1 aggregate deviation score
}

export interface Deviation {
  feature: string;
  observed: number | string;
  expected: number | string;
  score: number;   // 0–1 contribution to overall score
  description: string;
}

// ── Constants ──────────────────────────────────────────────────────────────

const MAX_EVENTS_PER_ACTOR = 500;
const BASELINE_MIN_SAMPLES = 50;
const RATE_WINDOW_MS       = 60_000;   // 1 minute
const HOUR_WINDOW_MS       = 3_600_000; // 1 hour

// ── AccessBehaviorModel ────────────────────────────────────────────────────

export class AccessBehaviorModel {
  // Per-actor sliding event window
  private readonly _events   = new Map<string, AccessEvent[]>();
  // Per-actor computed baselines
  private readonly _baselines = new Map<string, ActorBaseline>();
  // Warm-up: wait until enough samples before classifying
  private readonly _minSamples: number;

  constructor(minSamples = BASELINE_MIN_SAMPLES) {
    this._minSamples = minSamples;
  }

  // ── Record Event ──────────────────────────────────────────────────────────

  record(event: AccessEvent): void {
    const list = this._events.get(event.actorId) ?? [];
    list.push(event);

    // Trim to window
    if (list.length > MAX_EVENTS_PER_ACTOR) {
      list.splice(0, list.length - MAX_EVENTS_PER_ACTOR);
    }
    this._events.set(event.actorId, list);

    // Incrementally update baseline if enough data
    if (list.length >= this._minSamples) {
      this._updateBaseline(event.actorId, list);
    }
  }

  // ── Analyze ───────────────────────────────────────────────────────────────

  /**
   * Compute a deviation report for the given actor against their baseline.
   * Returns null if not enough data yet (warm-up period).
   */
  analyze(actorId: string, event: AccessEvent): DeviationReport | null {
    const baseline = this._baselines.get(actorId);
    const events   = this._events.get(actorId);
    if (!baseline || !events || events.length < this._minSamples) return null;

    const deviations: Deviation[] = [];

    // 1. Request rate deviation
    const recentCount = events.filter(e => e.timestamp >= Date.now() - RATE_WINDOW_MS).length;
    const expectedRate = baseline.avgRequestsPerMin;
    const rateStd      = Math.max(baseline.stdRequestsPerMin, 1); // avoid div by zero
    const rateZ        = Math.abs(recentCount - expectedRate) / rateStd;
    if (rateZ > 2) {
      const score = Math.min(1, (rateZ - 2) / 4);
      deviations.push({
        feature:     'request_rate',
        observed:    recentCount,
        expected:    expectedRate,
        score,
        description: `Request rate ${recentCount}/min vs baseline ${expectedRate.toFixed(1)}/min (z=${rateZ.toFixed(2)})`,
      });
    }

    // 2. New IP address
    if (!baseline.knownIps.has(event.sourceIp)) {
      deviations.push({
        feature:     'new_source_ip',
        observed:    event.sourceIp,
        expected:    `one of ${baseline.knownIps.size} known IPs`,
        score:       0.4,
        description: `Access from unknown IP ${event.sourceIp}`,
      });
    }

    // 3. Unusual hour
    const hour    = new Date(event.timestamp).getHours();
    const hourVal = baseline.hourDistribution[hour] ?? 0;
    if (hourVal < 0.02 && baseline.sampleCount > 100) {
      deviations.push({
        feature:     'unusual_time',
        observed:    hour,
        expected:    'business hours (or historical pattern)',
        score:       0.3,
        description: `Access at hour ${hour} is 98th+ percentile unusual`,
      });
    }

    // 4. Resource entropy spike (accessing many different paths rapidly)
    const recentResources = events
      .filter(e => e.timestamp >= Date.now() - RATE_WINDOW_MS)
      .map(e => e.resource);
    const observedEntropy = shannonEntropy(recentResources);
    if (observedEntropy > baseline.resourceEntropy * 1.8 && recentResources.length > 10) {
      const score = Math.min(1, (observedEntropy - baseline.resourceEntropy) / baseline.resourceEntropy);
      deviations.push({
        feature:     'resource_entropy',
        observed:    +observedEntropy.toFixed(3),
        expected:    +baseline.resourceEntropy.toFixed(3),
        score,
        description: `Accessing far more diverse resources than baseline (entropy ${observedEntropy.toFixed(2)} vs ${baseline.resourceEntropy.toFixed(2)})`,
      });
    }

    // 5. Unusual failure rate
    const recentFails = events
      .filter(e => e.timestamp >= Date.now() - RATE_WINDOW_MS)
      .filter(e => e.result === 'failure' || e.result === 'denied').length;
    if (recentFails > 10 && recentFails / Math.max(recentCount, 1) > 0.3) {
      deviations.push({
        feature:     'high_failure_rate',
        observed:    recentFails,
        expected:    0,
        score:       Math.min(1, recentFails / 30),
        description: `${recentFails} failures in the last minute — possible probing`,
      });
    }

    // Aggregate score (weighted average, not simple sum)
    const overallScore = deviations.length === 0
      ? 0
      : Math.min(1, deviations.reduce((acc, d) => acc + d.score, 0) / Math.max(deviations.length, 1) * 1.5);

    return { actorId, deviations, overallScore };
  }

  // ── Baseline Update ────────────────────────────────────────────────────────

  private _updateBaseline(actorId: string, events: AccessEvent[]): void {
    const now = Date.now();
    const windows: number[] = [];

    // Compute requests per minute over sliding windows
    for (let t = events[0]!.timestamp; t < now; t += RATE_WINDOW_MS) {
      const cnt = events.filter(e => e.timestamp >= t && e.timestamp < t + RATE_WINDOW_MS).length;
      windows.push(cnt);
    }

    const avg = mean(windows);
    const std = stddev(windows);

    // Hour distribution
    const hourCounts = new Array<number>(24).fill(0);
    events.forEach(e => {
      const h = new Date(e.timestamp).getHours();
      hourCounts[h] = (hourCounts[h] ?? 0) + 1;
    });
    const total = hourCounts.reduce((a, b) => a + b, 0) || 1;
    const hourDist = hourCounts.map(c => c / total);

    // Resource entropy
    const resources = events.map(e => e.resource);
    const entropy   = shannonEntropy(resources);

    // Known IPs
    const knownIps = new Set(events.map(e => e.sourceIp));

    // Method distribution
    const methodCounts: Record<string, number> = {};
    events.forEach(e => {
      methodCounts[e.method] = (methodCounts[e.method] ?? 0) + 1;
    });

    const existing = this._baselines.get(actorId);
    this._baselines.set(actorId, {
      actorId,
      actorType: events[events.length - 1]?.actorType ?? 'unknown',
      sampleCount: events.length,
      avgRequestsPerMin:  avg,
      stdRequestsPerMin:  std,
      avgRequestsPerHour: avg * 60,
      resourceEntropy:    entropy,
      hourDistribution:   hourDist,
      knownIps:           existing ? new Set([...existing.knownIps, ...knownIps]) : knownIps,
      methodDistribution:  methodCounts,
      lastUpdated:        now,
    });
  }

  /** Get baseline for an actor (for inspection/debugging). */
  getBaseline(actorId: string): ActorBaseline | undefined {
    return this._baselines.get(actorId);
  }

  /** Number of actors being modeled. */
  get actorCount(): number {
    return this._baselines.size;
  }

  /** Evict actors not seen for more than ttlMs milliseconds. */
  evictStale(ttlMs = 86_400_000): void {
    const cutoff = Date.now() - ttlMs;
    for (const [id, baseline] of this._baselines) {
      if (baseline.lastUpdated < cutoff) {
        this._baselines.delete(id);
        this._events.delete(id);
      }
    }
  }
}

// ── Math helpers ───────────────────────────────────────────────────────────

function mean(arr: number[]): number {
  if (arr.length === 0) return 0;
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}

function stddev(arr: number[]): number {
  if (arr.length < 2) return 0;
  const m = mean(arr);
  const variance = arr.reduce((acc, v) => acc + (v - m) ** 2, 0) / (arr.length - 1);
  return Math.sqrt(variance);
}

/** Shannon entropy over a list of string values. Normalized to [0, 1]. */
function shannonEntropy(items: string[]): number {
  if (items.length === 0) return 0;
  const counts: Record<string, number> = {};
  for (const s of items) counts[s] = (counts[s] ?? 0) + 1;
  const total = items.length;
  let entropy = 0;
  for (const c of Object.values(counts)) {
    const p   = c / total;
    entropy  -= p * Math.log2(p);
  }
  // Normalize by log2(unique items) to get [0, 1]
  const maxEntropy = Math.log2(Object.keys(counts).length) || 1;
  return entropy / maxEntropy;
}
