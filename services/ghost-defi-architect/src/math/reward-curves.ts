/**
 * reward-curves.ts — GhostChain DeFi reward mathematics.
 *
 * Pure TypeScript — no side effects, no filesystem access.
 *
 * Covers:
 *   - Pro-rata staking rewards (proportional distribution)
 *   - Block-emission decay schedules (halving, exponential decay)
 *   - APY / APR calculation
 *   - Reward-per-token accumulator math (Synthetix pattern, matches generated contracts)
 *   - Vesting release schedule simulation
 *   - Protocol fee split simulation
 */

// ── Pro-rata distribution ─────────────────────────────────────────────────────

/**
 * Reward earned by a single staker proportional to their share.
 *
 * @param stake       User's staked amount
 * @param totalStake  Total protocol staked amount
 * @param rewardPool  Total reward pool to distribute
 */
export function proRataReward(stake: number, totalStake: number, rewardPool: number): number {
  if (totalStake === 0) return 0;
  return (stake / totalStake) * rewardPool;
}

// ── Emission schedules ────────────────────────────────────────────────────────

/**
 * Tokens emitted at a given block using a halving schedule.
 *
 * Emission halves every `halvingInterval` blocks.
 *
 * @param block           Current block number
 * @param startBlock      Block at which emissions start
 * @param initialRate     Tokens per block at genesis
 * @param halvingInterval Blocks per halving epoch (e.g. 210_000 Bitcoin-style)
 */
export function emissionHalving(
  block: number,
  startBlock: number,
  initialRate: number,
  halvingInterval: number,
): number {
  if (block < startBlock) return 0;
  const epoch = Math.floor((block - startBlock) / halvingInterval);
  return initialRate / Math.pow(2, epoch);
}

/**
 * Tokens emitted at a given second using exponential decay.
 *
 * @param t           Seconds since emission start
 * @param initialRate Tokens per second at t=0
 * @param decayRate   Decay constant (e.g. 0.000001 per second)
 */
export function emissionDecay(t: number, initialRate: number, decayRate: number): number {
  return initialRate * Math.exp(-decayRate * t);
}

/**
 * Total tokens emitted from t=0 to t=T with exponential decay.
 * = initialRate / decayRate * (1 - e^(-decayRate * T))
 */
export function totalEmission(T: number, initialRate: number, decayRate: number): number {
  if (decayRate === 0) return initialRate * T;
  return (initialRate / decayRate) * (1 - Math.exp(-decayRate * T));
}

// ── APY / APR ─────────────────────────────────────────────────────────────────

/**
 * Annual Percentage Rate from reward rate and pool size.
 *
 * @param rewardPerSecond   Tokens emitted per second from the pool
 * @param totalStaked       Total value locked (in same token units)
 * @param tokenPriceRatio   rewardToken / stakedToken price ratio (default 1)
 */
export function aprFromRate(
  rewardPerSecond: number,
  totalStaked: number,
  tokenPriceRatio = 1,
): number {
  if (totalStaked === 0) return 0;
  const rewardPerYear = rewardPerSecond * 365.25 * 86_400;
  return (rewardPerYear * tokenPriceRatio) / totalStaked;
}

/**
 * Annual Percentage Yield (compounded APR).
 *
 * @param apr                    Annualised rate (0–∞, e.g. 0.50 = 50% APR)
 * @param compoundingsPerYear    How often rewards compound (e.g. 365 = daily)
 */
export function apyFromApr(apr: number, compoundingsPerYear = 365): number {
  return Math.pow(1 + apr / compoundingsPerYear, compoundingsPerYear) - 1;
}

/**
 * APY when compounding is continuous (e^apr - 1).
 */
export function apyContinuous(apr: number): number {
  return Math.exp(apr) - 1;
}

// ── Reward-per-token accumulator (Synthetix pattern) ─────────────────────────
//
// This math mirrors what the generated YieldFarm contracts implement on-chain.
// Useful for simulating exact reward accrual before deployment.

export interface AccumulatorState {
  rewardPerTokenStored: number;
  lastUpdateTime: number;
  rewardRate: number;      // tokens per second
  totalStaked: number;
}

export interface UserAccumulatorState {
  stakedBalance: number;
  userRewardPerTokenPaid: number;
  rewards: number;
}

/**
 * Update the global accumulator to `now`.
 * Returns a new `AccumulatorState` — immutable helper.
 */
export function updateAccumulator(state: AccumulatorState, now: number): AccumulatorState {
  if (state.totalStaked === 0) {
    return { ...state, lastUpdateTime: now };
  }
  const dt = Math.max(0, now - state.lastUpdateTime);
  const earned = (state.rewardRate * dt) / state.totalStaked;
  return {
    ...state,
    rewardPerTokenStored: state.rewardPerTokenStored + earned,
    lastUpdateTime: now,
  };
}

/**
 * Compute pending rewards for a user against a (possibly stale) accumulator.
 */
export function pendingRewards(
  global: AccumulatorState,
  user: UserAccumulatorState,
  now: number,
): number {
  const updated = updateAccumulator(global, now);
  const delta   = updated.rewardPerTokenStored - user.userRewardPerTokenPaid;
  return user.rewards + user.stakedBalance * delta;
}

// ── Vesting schedule simulation ───────────────────────────────────────────────

/**
 * Tokens released by a linear cliff-vesting schedule.
 *
 * @param now           Current timestamp (seconds)
 * @param start         Vesting start timestamp
 * @param cliff         Cliff timestamp (nothing released before this)
 * @param end           End of vesting period
 * @param totalAmount   Total tokens to vest
 */
export function vestedAmount(
  now: number,
  start: number,
  cliff: number,
  end: number,
  totalAmount: number,
): number {
  if (now < cliff) return 0;
  if (now >= end)  return totalAmount;
  return totalAmount * (now - start) / (end - start);
}

// ── Protocol fee split ────────────────────────────────────────────────────────

export interface FeeSplitResult {
  toLPs: number;
  toTreasury: number;
  toBuyback: number;
  toStakers: number;
  toProtocol: number;
}

/**
 * Split a fee amount according to governance-set proportions (must sum to 1).
 *
 * Default split (GhostXchange canonical):
 *   60% to LPs, 15% treasury, 10% buyback, 10% stakers, 5% protocol ops
 */
export function splitFee(
  feeAmount: number,
  split: {
    lpFraction?:       number;
    treasuryFraction?: number;
    buybackFraction?:  number;
    stakerFraction?:   number;
    protocolFraction?: number;
  } = {},
): FeeSplitResult {
  const lp       = split.lpFraction       ?? 0.60;
  const treasury = split.treasuryFraction ?? 0.15;
  const buyback  = split.buybackFraction  ?? 0.10;
  const stakers  = split.stakerFraction   ?? 0.10;
  const protocol = split.protocolFraction ?? 0.05;

  const total = lp + treasury + buyback + stakers + protocol;
  if (Math.abs(total - 1.0) > 0.001) {
    throw new RangeError(`splitFee: fractions must sum to 1, got ${total}`);
  }

  return {
    toLPs:       feeAmount * lp,
    toTreasury:  feeAmount * treasury,
    toBuyback:   feeAmount * buyback,
    toStakers:   feeAmount * stakers,
    toProtocol:  feeAmount * protocol,
  };
}

// ── Tokenomics supply simulation ──────────────────────────────────────────────

export interface TokenomicsSnapshot {
  block: number;
  circulatingSupply: number;
  emittedThisEpoch: number;
  burnedThisEpoch: number;
  netSupplyChange: number;
}

/**
 * Simulate supply evolution over `blocks` blocks.
 *
 * @param initialSupply   Starting circulating supply
 * @param blocks          Number of blocks to simulate
 * @param emissionRate    Tokens minted per block (before halving)
 * @param burnRatePct     Percentage of each block's emission that is burned (0–1)
 * @param halvingInterval Blocks per halving (0 = no halving)
 * @param sampleInterval  How often to record a snapshot
 */
export function simulateSupply(
  initialSupply: number,
  blocks: number,
  emissionRate: number,
  burnRatePct: number,
  halvingInterval = 0,
  sampleInterval = 10_000,
): TokenomicsSnapshot[] {
  const snapshots: TokenomicsSnapshot[] = [];
  let supply = initialSupply;

  for (let b = 0; b <= blocks; b += sampleInterval) {
    const epochBlocks = Math.min(sampleInterval, blocks - b + sampleInterval);
    const rate = halvingInterval > 0
      ? emissionHalving(b, 0, emissionRate, halvingInterval)
      : emissionRate;

    const emitted = rate * epochBlocks;
    const burned  = emitted * burnRatePct;
    const net     = emitted - burned;
    supply       += net;

    snapshots.push({
      block: b,
      circulatingSupply: supply,
      emittedThisEpoch:  emitted,
      burnedThisEpoch:   burned,
      netSupplyChange:   net,
    });
  }

  return snapshots;
}
