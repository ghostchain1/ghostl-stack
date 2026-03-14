/**
 * GhostChain Security Policy Constants
 *
 * Rules:
 *   - validator uptime ≥ 95 %
 *   - slashing signal on missed-block threshold breach
 *   - bridge and tx-spike anomaly monitoring
 */

export const SECURITY_POLICY = {
  // Minimum acceptable validator uptime (%)
  MIN_VALIDATOR_UPTIME: 95,

  // Missed blocks within the signing window before a penalise signal is raised
  MAX_MISSED_BLOCKS_WINDOW: 100,

  // Tx rate spike ratio vs 24 h rolling average that triggers an alert
  TX_SPIKE_THRESHOLD: 5,

  // Consecutive missed settlement windows before circuit-breaker alert
  MAX_MISSED_SETTLEMENTS: 3,

  // Pool TVL drop percentage in one cycle that flags anomalous drain
  LIQUIDITY_DRAIN_DROP_PCT: 30,

  // Bridge volume multiplier vs 24 h average that flags an anomaly
  BRIDGE_SPIKE_MULTIPLIER: 10,

  // Block time thresholds (seconds) — values outside these indicate node issues
  MIN_BLOCK_TIME: 0.5,
  MAX_BLOCK_TIME: 30,
} as const;
