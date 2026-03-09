/**
 * Liquidity Policy
 *
 * Thresholds for cross-chain liquidity routing and arbitrage decisions.
 * All values are tunable via environment variables.
 */

function envFloat(key: string, def: number): number {
  const v = process.env[key];
  if (!v) return def;
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : def;
}

function envInt(key: string, def: number): number {
  const v = process.env[key];
  if (!v) return def;
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? n : def;
}

export const LIQUIDITY_POLICY = {
  /**
   * Minimum APR differential (percentage points) required to trigger a
   * liquidity rebalance proposal (external APR must exceed internal by this margin).
   * Default: 2.0 %
   */
  MIN_APR_DIFF_PCT: envFloat("LIQ_MIN_APR_DIFF_PCT", 2.0),

  /**
   * Maximum percentage of a pool's TVL to move in a single rebalance,
   * expressed in basis points (500 bps = 5 %).
   */
  MAX_MOVE_BPS: envInt("LIQ_MAX_MOVE_BPS", 500),

  /**
   * Minimum price spread (%) between GhostXchange and an external DEX
   * before an arbitrage proposal is generated.
   * Default: 2.0 %
   */
  MIN_ARBITRAGE_SPREAD_PCT: envFloat("ARB_MIN_SPREAD_PCT", 2.0),

  /**
   * Minimum oracle refresh interval in milliseconds.
   * Prevents flooding GhostBrain with price update requests.
   * Default: 60 seconds.
   */
  ORACLE_REFRESH_INTERVAL_MS: envInt("ORACLE_REFRESH_MS", 60_000),
} as const;
