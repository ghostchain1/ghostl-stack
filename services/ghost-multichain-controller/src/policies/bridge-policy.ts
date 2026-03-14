/**
 * Bridge Policy
 *
 * Health and safety thresholds for cross-chain bridge monitoring.
 * All values are tunable via environment variables.
 */

function envInt(key: string, def: number): number {
  const v = process.env[key];
  if (!v) return def;
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? n : def;
}

export const BRIDGE_POLICY = {
  /** Minimum health score (0–100); below this threshold a restart is proposed. */
  MIN_HEALTH_SCORE: envInt("BRIDGE_MIN_HEALTH", 95),

  /** Maximum pending transactions before the bridge is flagged as congested. */
  MAX_PENDING_TXS: envInt("BRIDGE_MAX_PENDING_TXS", 50),

  /** Maximum observed bridge latency in milliseconds. */
  MAX_LATENCY_MS: envInt("BRIDGE_MAX_LATENCY_MS", 5_000),

  /** Maximum block sync lag before flagging (blocks). */
  MAX_SYNC_LAG_BLOCKS: envInt("BRIDGE_MAX_SYNC_LAG", 100),

  /**
   * Risk score (0–100) above which a bridge is PAUSED rather than just flagged.
   * Bridges at or above this score are considered critically unsafe.
   */
  CRITICAL_RISK_SCORE: envInt("BRIDGE_CRITICAL_RISK", 80),

  /** Cycle interval for the multichain controller (milliseconds). */
  CYCLE_INTERVAL_MS: envInt("MULTICHAIN_CYCLE_MS", 20_000),
} as const;
