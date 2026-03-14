/**
 * GhostChain Liquidity Policy Constants
 *
 * Rule: L2 liquidity pools must maintain a minimum 5 % GST reserve ratio.
 */

export const LIQUIDITY_POLICY = {
  // Minimum GST reserve as a percentage of pool TVL
  MIN_GST_RESERVE_PCT: 5,           // %

  // Single-pool TVL concentration ceiling
  MAX_TVL_CONCENTRATION_PCT: 40,    // %

  // Amount proposed for injection when pools fall below minimum
  INJECT_AMOUNT: 10_000n * 10n ** 18n,   // 10 000 GST

  // Amount proposed for withdrawal when pools are over-concentrated
  WITHDRAW_AMOUNT: 5_000n * 10n ** 18n,   // 5 000 GST

  // Minimum number of governor cycles between rebalance proposals (anti-thrash)
  MIN_REBALANCE_INTERVAL_CYCLES: 5,
} as const;
