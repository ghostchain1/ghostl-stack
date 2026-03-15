/**
 * Anomaly Engine — Statistical anomaly detection across all platform metrics
 *
 * Uses z-score (3-sigma rule): |z| > 3 → anomaly.
 *
 * Maintains a rolling 24-hour baseline of metric values (per entity + metric
 * name) stored in the DB. Detection is real-time: each new observation is
 * z-scored against the current rolling window.
 *
 * Monitored metrics:
 *  gift_rate          — gifts/min per stream
 *  viewer_count       — peak viewers per stream hour
 *  follower_rate      — new followers/hour per creator
 *  game_score         — score per completed game session
 *  payment_volume     — USD purchased per user per hour
 *  chat_rate          — messages/min in a stream
 *  tip_size           — individual tip GST amount
 */

import { getDb } from '../backend/src/db/index.js';
import { v4 as uuidv4 } from 'uuid';

// ── Types ──────────────────────────────────────────────────────────────────────

export type AnomalySeverity = 'info' | 'warning' | 'alert' | 'critical';

export interface MetricSample {
  entityId:   string;    // streamId, userId, gameId, etc.
  metricName: string;
  value:      number;
  sampledAt:  string;
}

export interface AnomalyResult {
  entityId:    string;
  metricName:  string;
  value:       number;
  mean:        number;
  stdDev:      number;
  zScore:      number;
  isAnomaly:   boolean;
  severity:    AnomalySeverity;
  detectedAt:  string;
}

export interface AnomalyAlert {
  alertId:    string;
  entityId:   string;
  metricName: string;
  zScore:     number;
  severity:   AnomalySeverity;
  value:      number;
  baseline:   { mean: number; stdDev: number };
  createdAt:  string;
}

// ── Thresholds ─────────────────────────────────────────────────────────────────

const Z_SCORE_WARNING  = 2.0;
const Z_SCORE_ALERT    = 3.0;
const Z_SCORE_CRITICAL = 4.5;
const MIN_SAMPLES      = 10;    // need at least 10 data points for baseline

// ── Core detection ─────────────────────────────────────────────────────────────

/**
 * Record a metric observation and immediately z-score it against the
 * entity's rolling 24h baseline.
 *
 * Returns an AnomalyResult — check `isAnomaly` to decide if action is needed.
 */
export function detectAnomaly(sample: MetricSample): AnomalyResult {
  const db = getDb();

  // Persist sample
  db.prepare(`
    INSERT INTO metric_samples
      (sample_id, entity_id, metric_name, value, sampled_at)
    VALUES (?, ?, ?, ?, ?)
  `).run(uuidv4(), sample.entityId, sample.metricName,
         sample.value, sample.sampledAt);

  // Compute 24h rolling stats
  const stats = db.prepare(`
    SELECT AVG(value) AS mean,
           SUM((value - (SELECT AVG(value) FROM metric_samples
                         WHERE entity_id = ? AND metric_name = ?
                           AND sampled_at >= datetime('now', '-24 hours'))) *
               (value - (SELECT AVG(value) FROM metric_samples
                         WHERE entity_id = ? AND metric_name = ?
                           AND sampled_at >= datetime('now', '-24 hours'))))
           / COUNT(*) AS variance,
           COUNT(*) AS cnt
    FROM metric_samples
    WHERE entity_id = ? AND metric_name = ?
      AND sampled_at >= datetime('now', '-24 hours')
  `).get(
    sample.entityId, sample.metricName,
    sample.entityId, sample.metricName,
    sample.entityId, sample.metricName
  ) as any;

  const mean   = stats?.mean   ?? sample.value;
  const stdDev = stats?.variance != null ? Math.sqrt(Math.max(0, stats.variance)) : 0;
  const cnt    = stats?.cnt    ?? 1;

  // Need enough samples for a meaningful baseline
  if (cnt < MIN_SAMPLES || stdDev === 0) {
    return { entityId: sample.entityId, metricName: sample.metricName,
             value: sample.value, mean, stdDev, zScore: 0, isAnomaly: false,
             severity: 'info', detectedAt: new Date().toISOString() };
  }

  const zScore   = (sample.value - mean) / stdDev;
  const absZ     = Math.abs(zScore);
  const severity = _severityFromZ(absZ);
  const isAnomaly = absZ >= Z_SCORE_ALERT;

  if (isAnomaly) {
    _persistAlert({
      alertId:    uuidv4(),
      entityId:   sample.entityId,
      metricName: sample.metricName,
      zScore,
      severity,
      value:      sample.value,
      baseline:   { mean, stdDev },
      createdAt:  new Date().toISOString(),
    });
  }

  return {
    entityId:   sample.entityId,
    metricName: sample.metricName,
    value:      sample.value,
    mean,
    stdDev,
    zScore,
    isAnomaly,
    severity,
    detectedAt: new Date().toISOString(),
  };
}

// ── Domain-specific helpers ────────────────────────────────────────────────────

/** Check if a stream has an anomalous gift rate. */
export function analyzeGiftSpike(streamId: string, giftsPerMin: number): AnomalyResult {
  return detectAnomaly({
    entityId:   streamId,
    metricName: 'gift_rate',
    value:      giftsPerMin,
    sampledAt:  new Date().toISOString(),
  });
}

/** Check if a creator has an anomalous follower surge. */
export function analyzeFollowerSurge(userId: string, followersPerHour: number): AnomalyResult {
  return detectAnomaly({
    entityId:   userId,
    metricName: 'follower_rate',
    value:      followersPerHour,
    sampledAt:  new Date().toISOString(),
  });
}

/** Check if a game score is anomalous (possible cheating). */
export function analyzeGameScore(gameId: string, score: number): AnomalyResult {
  return detectAnomaly({
    entityId:   gameId,
    metricName: 'game_score',
    value:      score,
    sampledAt:  new Date().toISOString(),
  });
}

/** Check if payment volume for a user is anomalous. */
export function analyzePaymentVolume(userId: string, usdAmount: number): AnomalyResult {
  return detectAnomaly({
    entityId:   userId,
    metricName: 'payment_volume',
    value:      usdAmount,
    sampledAt:  new Date().toISOString(),
  });
}

/** Get recent anomaly alerts (for dashboard). */
export function getRecentAnomalies(limitHours = 24, limit = 50): AnomalyAlert[] {
  const db = getDb();
  return db.prepare(`
    SELECT * FROM anomaly_alerts
    WHERE created_at >= datetime('now', '-${limitHours} hours')
    ORDER BY created_at DESC LIMIT ?
  `).all(limit) as AnomalyAlert[];
}

/** Get the baseline statistics for an entity/metric pair. */
export function getBaseline(entityId: string, metricName: string) {
  const db = getDb();
  return db.prepare(`
    SELECT
      AVG(value)   AS mean,
      COUNT(*)     AS samples,
      MIN(value)   AS min_val,
      MAX(value)   AS max_val,
      MAX(sampled_at) AS last_sample
    FROM metric_samples
    WHERE entity_id = ? AND metric_name = ?
      AND sampled_at >= datetime('now', '-24 hours')
  `).get(entityId, metricName);
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function _severityFromZ(absZ: number): AnomalySeverity {
  if (absZ >= Z_SCORE_CRITICAL) return 'critical';
  if (absZ >= Z_SCORE_ALERT)    return 'alert';
  if (absZ >= Z_SCORE_WARNING)  return 'warning';
  return 'info';
}

function _persistAlert(alert: AnomalyAlert): void {
  const db = getDb();
  db.prepare(`
    INSERT INTO anomaly_alerts
      (alert_id, entity_id, metric_name, z_score, severity, value,
       mean, std_dev, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(alert.alertId, alert.entityId, alert.metricName, alert.zScore,
         alert.severity, alert.value, alert.baseline.mean,
         alert.baseline.stdDev, alert.createdAt);
}
