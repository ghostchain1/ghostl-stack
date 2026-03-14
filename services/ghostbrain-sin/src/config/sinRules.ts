// SIN — Sovereign policy rules and invariants
// These are the outer bounds AI may recommend.  Proposals outside these limits
// are blocked at the module level before reaching the signing relay.

export const SIN_RULES = {

  // ── Economic bounds ────────────────────────────────────────────────────────
  maxInflationPct:               5.0,  // never recommend > 5% annual inflation
  minInflationPct:              -1.0,  // never recommend deflation below -1%
  maxBurnAdjustmentPct:          1.0,  // largest single-cycle burn-rate change
  targetBurnRatePct:             2.0,  // ideal GST burn rate
  targetAPRPct:                 12.0,  // ideal validator staking APR

  // ── Governance bounds ──────────────────────────────────────────────────────
  minValidatorCount:            21,    // governance is unsafe below this
  maxRegionalConcentrationPct:  33,    // no single region controls > one-third

  // ── Treasury bounds ────────────────────────────────────────────────────────
  treasuryReservePct:           20,    // minimum % kept as liquid reserve
  maxCycleAllocationShiftPct:   10,    // largest single-cycle reallocation shift

  // ── Liquidity bounds ───────────────────────────────────────────────────────
  minL1LiquidityPct:            40,    // L1 must hold ≥ 40% of system liquidity
  minL2LiquidityPct:            20,    // L2 must hold ≥ 20%
  maxL3LiquidityPct:            20,    // L3 must not exceed 20%

  // ── Security thresholds ────────────────────────────────────────────────────
  criticalValidatorOfflinePct:  33,    // > 33% offline → critical
  highValidatorOfflinePct:      20,    // > 20% offline → high

} as const;

export type SinRules = typeof SIN_RULES;
