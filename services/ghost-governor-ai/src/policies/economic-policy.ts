/**
 * GhostChain Economic Policy Constants
 *
 * Rules:
 *   - GST burn        = 0.5% of transaction volume
 *   - Treasury alloc  = 10% of fees
 *   - Validator reward = dynamic (based on performance score)
 */

export const ECONOMIC_POLICY = {
  // GST burn rate deducted per transaction
  GST_BURN_RATE_BPS: 50,                              // 0.5 %

  // Portion of fee revenue routed to treasury
  TREASURY_FEE_ALLOCATION_BPS: 1_000,                 // 10 %

  // Treasury balance below which buyback is suspended
  TREASURY_MIN_BALANCE: 50_000n * 10n ** 18n,         // 50 000 GST

  // Treasury balance above which capital deployment is proposed
  TREASURY_INVEST_THRESHOLD: 1_000_000n * 10n ** 18n, // 1 000 000 GST

  // Validator reward tier bonuses (applied above base reward)
  VALIDATOR_REWARD_TIERS: [
    { minScore: 99, bonusBps: 200 }, // +2 % top tier
    { minScore: 97, bonusBps: 100 }, // +1 % high tier
    { minScore: 95, bonusBps:   0 }, // standard tier (no bonus, no penalty)
  ] as { minScore: number; bonusBps: number }[],

  // Performance minimum — below this, penalise signal is raised
  VALIDATOR_MIN_UPTIME: 95, // %

  // Governor cycle interval
  CYCLE_INTERVAL_MS: 60_000, // 1 minute
} as const;
