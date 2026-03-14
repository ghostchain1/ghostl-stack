import { config } from '../config.js';
import { query } from '../db/index.js';

const BPS_DENOMINATOR = 10_000;

export type FeePolicy = {
  chainKey: string;
  maxBaseFee: number;
  maxPriorityFee: number;
  spikeThresholdBps: number;
  windowSeconds: number;
  violationPenaltyBps: number;
  minBond: number;
  autoExecEnabled: boolean;
};

export type FeeSample = {
  baseFee: number;
  priorityFee: number;
  gasUsedRatio: number;
  blockNumber?: number;
  observedAt: string;
};

export type FeeRecommendation = {
  recommendedBaseFee: number;
  recommendedPriorityFee: number;
  volatilityScore: number;
  anomalyScore: number;
  drivers: Record<string, number>;
  policyBounds: {
    maxBaseFee: number;
    maxPriorityFee: number;
    spikeThresholdBps: number;
    windowSeconds: number;
    violationPenaltyBps: number;
    minBond: number;
  };
};

const defaultPolicy: Omit<FeePolicy, 'chainKey'> = {
  maxBaseFee: 2_000_000_000,
  maxPriorityFee: 1_000_000_000,
  spikeThresholdBps: 500,
  windowSeconds: 300,
  violationPenaltyBps: 1_000,
  minBond: 10 * 10 ** 18,
  autoExecEnabled: false
};

const toNumber = (value: unknown, fallback = 0): number => {
  if (value == null) return fallback;
  if (typeof value === 'number') return value;
  if (typeof value === 'bigint') return Number(value);
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const clamp = (value: number, min: number, max: number): number => Math.min(max, Math.max(min, value));

const ewma = (values: number[], alpha = 0.35): number => {
  if (values.length === 0) return 0;
  let acc = values[0] ?? 0;
  for (let i = 1; i < values.length; i += 1) {
    acc = alpha * values[i]! + (1 - alpha) * acc;
  }
  return acc;
};

const stdDev = (values: number[]): number => {
  if (values.length < 2) return 0;
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  const variance = values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / (values.length - 1);
  return Math.sqrt(variance);
};

const computeVolatility = (values: number[]): number => {
  if (values.length === 0) return 0;
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  if (mean === 0) return 0;
  return clamp(stdDev(values) / mean, 0, 1);
};

const computeAnomaly = (latest: number, baseline: number, maxValue: number): number => {
  if (baseline <= 0 || maxValue <= 0) return 0;
  const delta = Math.abs(latest - baseline);
  return clamp(delta / maxValue, 0, 1);
};

export async function loadFeePolicy(chainKey: string): Promise<FeePolicy> {
  const rows = await query<{
    chain_key: string;
    max_base_fee: string;
    max_priority_fee: string;
    spike_threshold_bps: number;
    window_seconds: number;
    violation_penalty_bps: number;
    min_bond: string;
    auto_exec_enabled: boolean;
  }>(
    `SELECT chain_key, max_base_fee, max_priority_fee, spike_threshold_bps, window_seconds, violation_penalty_bps, min_bond, auto_exec_enabled
     FROM gas_fee_policy
     WHERE chain_key = $1
     ORDER BY updated_at DESC
     LIMIT 1`,
    [chainKey]
  );
  const row = rows[0];
  if (!row) {
    return { chainKey, ...defaultPolicy };
  }
  return {
    chainKey: row.chain_key,
    maxBaseFee: toNumber(row.max_base_fee, defaultPolicy.maxBaseFee),
    maxPriorityFee: toNumber(row.max_priority_fee, defaultPolicy.maxPriorityFee),
    spikeThresholdBps: row.spike_threshold_bps ?? defaultPolicy.spikeThresholdBps,
    windowSeconds: row.window_seconds ?? defaultPolicy.windowSeconds,
    violationPenaltyBps: row.violation_penalty_bps ?? defaultPolicy.violationPenaltyBps,
    minBond: toNumber(row.min_bond, defaultPolicy.minBond),
    autoExecEnabled: row.auto_exec_enabled ?? false
  };
}

export async function loadRecentFeeSamples(chainKey: string, limit = config.FEE_WATCHER_WINDOW_SIZE): Promise<FeeSample[]> {
  const rows = await query<{
    base_fee: string | null;
    priority_fee: string | null;
    gas_used_ratio: string | null;
    block_number: string | null;
    observed_at: string;
  }>(
    `SELECT base_fee, priority_fee, gas_used_ratio, block_number, observed_at
     FROM gas_fee_samples
     WHERE chain_key = $1
     ORDER BY observed_at DESC
     LIMIT $2`,
    [chainKey, limit]
  );

  // Return samples oldest -> newest so EWMA trends forward in time.
  return rows
    .reverse()
    .map((row) => ({
      baseFee: toNumber(row.base_fee, 0),
      priorityFee: toNumber(row.priority_fee, 0),
      gasUsedRatio: clamp(toNumber(row.gas_used_ratio, 0), 0, 1),
      blockNumber: row.block_number != null ? Number(row.block_number) : undefined,
      observedAt: row.observed_at
    }))
    .filter((sample) => sample.baseFee > 0);
}

export function computeRecommendation(samples: FeeSample[], policy: FeePolicy): FeeRecommendation {
  const baseFees = samples.map((sample) => sample.baseFee);
  const priorityFees = samples.map((sample) => sample.priorityFee).filter((value) => value > 0);
  const gasUsedRatios = samples.map((sample) => sample.gasUsedRatio);

  const baseBaseline = ewma(baseFees);
  const priorityBaseline = priorityFees.length > 0 ? ewma(priorityFees) : baseBaseline * 0.1;
  const latestBase = baseFees[baseFees.length - 1] ?? baseBaseline;

  const recommendedBaseFee = clamp(baseBaseline, 1, policy.maxBaseFee);
  const recommendedPriorityFee = clamp(priorityBaseline, 1, policy.maxPriorityFee);

  const baseVolatility = computeVolatility(baseFees);
  const priorityVolatility = computeVolatility(priorityFees);
  const volatilityScore = clamp((baseVolatility + priorityVolatility) / 2, 0, 1);
  const anomalyScore = computeAnomaly(latestBase, baseBaseline, policy.maxBaseFee);

  const avgGasUsedRatio =
    gasUsedRatios.length > 0 ? gasUsedRatios.reduce((sum, value) => sum + value, 0) / gasUsedRatios.length : 0;
  const spikeRatio =
    baseFees.length > 1 && baseFees[baseFees.length - 2]! > 0
      ? latestBase / baseFees[baseFees.length - 2]!
      : 1;
  const spikeThresholdRatio = (BPS_DENOMINATOR + policy.spikeThresholdBps) / BPS_DENOMINATOR;

  const drivers = {
    congestion: clamp(avgGasUsedRatio, 0, 1),
    volatility: volatilityScore,
    spike: clamp(spikeRatio / spikeThresholdRatio, 0, 2),
    baseline: baseBaseline > 0 ? clamp(latestBase / baseBaseline, 0, 2) : 1
  };

  return {
    recommendedBaseFee,
    recommendedPriorityFee,
    volatilityScore,
    anomalyScore,
    drivers,
    policyBounds: {
      maxBaseFee: policy.maxBaseFee,
      maxPriorityFee: policy.maxPriorityFee,
      spikeThresholdBps: policy.spikeThresholdBps,
      windowSeconds: policy.windowSeconds,
      violationPenaltyBps: policy.violationPenaltyBps,
      minBond: policy.minBond
    }
  };
}

export async function generateRecommendation(chainKey: string, limit = config.FEE_WATCHER_WINDOW_SIZE) {
  const [policy, samples] = await Promise.all([loadFeePolicy(chainKey), loadRecentFeeSamples(chainKey, limit)]);
  if (samples.length === 0) {
    return null;
  }

  const recommendation = computeRecommendation(samples, policy);
  await query(
    `INSERT INTO gas_fee_recommendations
       (chain_key, recommended_base_fee, recommended_priority_fee, volatility_score, anomaly_score, drivers, policy_bounds)
     VALUES ($1,$2,$3,$4,$5,$6,$7)`,
    [
      chainKey,
      recommendation.recommendedBaseFee,
      recommendation.recommendedPriorityFee,
      recommendation.volatilityScore,
      recommendation.anomalyScore,
      JSON.stringify(recommendation.drivers),
      JSON.stringify(recommendation.policyBounds)
    ]
  );

  return { policy, samples, recommendation };
}
