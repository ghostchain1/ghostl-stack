// ── AI scoring and prediction models ──────────────────────────────────────────
// Currently rules-based with weighted scoring.
// Designed for future integration of ML models, reinforcement learning,
// and predictive maintenance algorithms.

export interface SystemScore {
  cpu:     number; // 0–100
  memory:  number; // 0–100
  network: number; // 0–100 (normalized)
}

/**
 * Evaluates overall system health as a composite risk score (0–100).
 * Higher score = greater risk of failure.
 */
export function evaluateSystem(metrics: SystemScore): number {
  return (
    metrics.cpu     * 0.40 +
    metrics.memory  * 0.30 +
    metrics.network * 0.30
  );
}

/**
 * Predicts failure probability as a percentage (0–100).
 * Weighted combination of resource pressures with extra weight on disk critical zone.
 */
export function predictFailureProbability(
  cpu:       number,
  memory:    number,
  disk:      number,
  latencyMs: number,
): number {
  const latencyScore = Math.min(100, latencyMs / 20); // 2000ms maps to 100
  const diskScore    = disk > 80 ? (disk - 80) * 5 : 0; // extra weight above 80%
  const raw = cpu * 0.35 + memory * 0.30 + diskScore * 0.20 + latencyScore * 0.15;
  return Math.min(100, raw);
}

/**
 * Classifies a composite system score into a health tier.
 */
export function classifyHealth(score: number): "healthy" | "degraded" | "critical" {
  if (score < 40) return "healthy";
  if (score < 70) return "degraded";
  return "critical";
}

/**
 * Recommends a target node count for scaling based on current load.
 */
export function recommendScaleTarget(avgCpu: number, onlineNodes: number): number {
  if (avgCpu > 80) return Math.ceil(onlineNodes * 1.5);
  if (avgCpu > 60) return onlineNodes + 1;
  return onlineNodes;
}
