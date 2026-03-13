/**
 * Shared types for the Ghost Autonomous Economic Engine (AEE).
 * All proposals are unconditionally advisory — humans must ratify via
 * the signing relay before any on-chain action is taken.
 */

// ── Chain / token ─────────────────────────────────────────────────────────────

export const GST_UNIT = BigInt('1000000000000000000'); // 1 GST = 1e18 wei

/** Convert wei bigint → human-readable GST number */
export function weiToGst(wei: bigint): number {
  return Number(wei / (GST_UNIT / 1000n)) / 1000;
}

// ── Treasury ──────────────────────────────────────────────────────────────────

export interface TreasuryState {
  walletAddress: string;
  balanceWei: bigint;
  balanceGst: number;
  blockNumber: number;
  ts: number;
}

export interface Allocation {
  operations:    number; // fraction 0–1
  validators:    number;
  liquidity:     number;
  reserve:       number;
  // absolute sums in GST (advisory targets)
  operationsGst: number;
  validatorsGst: number;
  liquidityGst:  number;
  reserveGst:    number;
}

// ── Validator / staking ───────────────────────────────────────────────────────

export interface ValidatorInfo {
  operatorAddress:  string;
  moniker:          string;
  status:           'BOND_STATUS_BONDED' | 'BOND_STATUS_UNBONDED' | 'BOND_STATUS_UNBONDING';
  bondedTokensGst:  number;
  jailed:           boolean;
}

export interface ValidatorMetrics {
  activeCount:       number;
  jailedCount:       number;
  totalBondedGst:    number;
  participationRate: number; // 0–1
  ts:                number;
}

// ── Liquidity / DEX ──────────────────────────────────────────────────────────

export interface PoolState {
  poolId:    string;
  token0:    string;
  token1:    string;
  reserve0:  number; // in GST equivalents
  reserve1:  number;
  ratio:     number; // token0 fraction (0.5 = balanced)
  tvlGst:    number;
  ts:        number;
}

// ── Market ────────────────────────────────────────────────────────────────────

export interface BlockSample {
  blockNumber: number;
  txCount:     number;
  ts:          number;
}

export interface MarketMetrics {
  tpsAvg:               number;
  tpsPeak:              number;
  blockTimeAvgMs:       number;
  treasuryFlowGstPerMin: number; // positive = inflow, negative = drain
  burnRatePct:          number;
  ts:                   number;
}

// ── Economic forecast ─────────────────────────────────────────────────────────

export interface ForecastSample {
  tps:               number;
  treasuryGst:       number;
  participationRate: number;
  ts:                number;
}

export interface EconomicForecast {
  projectedTps:               number;
  projectedTreasuryGst:       number;
  projectedParticipationRate: number;
  inflationRatePctPerYear:    number;
  recommendBurn:              boolean;
  recommendMoreValidators:    boolean;
  confidence:                 number; // 0–1
  horizonMinutes:             number;
  ts:                         number;
}

// ── Yield ─────────────────────────────────────────────────────────────────────

export interface YieldStrategy {
  id:          string;  // e.g. "ghostchain-staking"
  description: string;
  aprPct:      number;  // annualised percentage rate
  riskLevel:   'low' | 'medium' | 'high';
  maxCapGst:   number;  // max recommended GST allocation
}

// ── Proposals (always advisory) ───────────────────────────────────────────────

export type ProposalTarget =
  | 'burn'
  | 'rewards'
  | 'liquidity'
  | 'yield'
  | 'allocation';

export interface EconomicProposal {
  id:        string;
  ts:        number;
  source:    'ghost-economic-ai';
  target:    ProposalTarget;
  action:    string;
  amountGst?: number;
  reason:    string;
  advisory:  true;          // ALWAYS true — never remove this flag
  metadata?: Record<string, unknown>;
}

// ── Service status ────────────────────────────────────────────────────────────

export interface AeeStatus {
  running:      boolean;
  dryRun:       boolean;
  totalCycles:  number;
  errors:       number;
  proposals:    number;
  lastCycleMs:  number | null;
  uptime:       number;   // seconds
  treasury:     TreasuryState | null;
  allocation:   Allocation | null;
  market:       MarketMetrics | null;
  forecast:     EconomicForecast | null;
  validators:   ValidatorMetrics | null;
}
