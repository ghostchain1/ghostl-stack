import type { AutonomyFeatures } from './types.js';

const clamp = (value: number, min = 0, max = 1) => Math.min(max, Math.max(min, value));

export const buildFeatures = (input: {
  failureRate: number;
  outOfGasRate: number;
  congestion: number;
  avgGasUsed: number;
  avgEstimate: number;
  retriesPerDeployment: number;
}): AutonomyFeatures => ({
  failureRate: clamp(input.failureRate),
  outOfGasRate: clamp(input.outOfGasRate),
  congestion: clamp(input.congestion),
  avgGasUsed: Math.max(input.avgGasUsed, 0),
  avgEstimate: Math.max(input.avgEstimate, 0),
  retriesPerDeployment: Math.max(input.retriesPerDeployment, 0)
});

export const predictOutcome = (features: AutonomyFeatures) => {
  const congestionPenalty = features.congestion * 0.2;
  const outOfGasPenalty = features.outOfGasRate * 0.35;
  const failurePenalty = features.failureRate * 0.4;
  const retryPenalty = Math.min(features.retriesPerDeployment * 0.05, 0.1);

  const predictedSuccess = clamp(1 - (congestionPenalty + outOfGasPenalty + failurePenalty + retryPenalty), 0.05, 0.99);
  const riskScore = clamp(1 - predictedSuccess, 0, 1);
  const confidence = clamp(0.55 + (1 - failurePenalty) * 0.3 + (1 - congestionPenalty) * 0.1, 0.4, 0.95);

  return {
    predictedSuccess,
    riskScore,
    confidence
  };
};
