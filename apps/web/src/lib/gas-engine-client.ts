import { z } from 'zod';
import { resolveGasEngineBase } from './runtime';

const baseUrl = () => resolveGasEngineBase();

const randomHex = () => {
  const uuid = globalThis.crypto?.randomUUID?.() || `${Math.random()}${Date.now()}`;
  return uuid.replace(/[^a-f0-9]/gi, '').padEnd(32, '0');
};

const traceparent = () => {
  const traceId = randomHex().slice(0, 32);
  const spanId = randomHex().slice(0, 16);
  return `00-${traceId}-${spanId}-01`;
};

const errorSchema = z.object({
  error: z.string(),
  hint: z.string().optional()
});

export const chainSchema = z.object({
  key: z.string(),
  chainId: z.number(),
  name: z.string(),
  type: z.enum(['L1', 'L2', 'L3']),
  rpcUrl: z.string(),
  gasTokenSymbol: z.string(),
  gasTokenAddress: z.string().optional(),
  gasTokenName: z.string().optional(),
  gasTokenDecimals: z.number().int().optional()
});

export const chainsResponseSchema = z.object({
  chains: z.array(chainSchema)
});

export const policySchema = z.object({
  chainKey: z.string(),
  chainId: z.number(),
  chainName: z.string(),
  chainType: z.enum(['L1', 'L2', 'L3']),
  gasTokenSymbol: z.string(),
  version: z.string(),
  baseMultiplier: z.number(),
  maxGasLimit: z.number(),
  safetyMarginPercent: z.number(),
  retry: z.object({
    maxRetries: z.number(),
    backoffMs: z.number(),
    multiplierStep: z.number()
  }),
  sequencerAware: z.boolean()
});

export const policiesResponseSchema = z.object({
  policies: z.array(policySchema)
});

export const deploymentSchema = z.object({
  id: z.string(),
  chain_key: z.string(),
  name: z.string().nullable(),
  mode: z.string().nullable().optional(),
  status: z.string(),
  created_at: z.string(),
  updated_at: z.string()
});

export const deploymentsResponseSchema = z.object({
  deployments: z.array(deploymentSchema)
});

export const attemptSchema = z.object({
  id: z.string(),
  decision_id: z.string().nullable().optional(),
  attempt: z.number(),
  tx_hash: z.string().nullable(),
  gas_limit: z.string().nullable(),
  gas_price: z.string().nullable(),
  max_fee_per_gas: z.string().nullable(),
  max_priority_fee_per_gas: z.string().nullable(),
  status: z.string(),
  failure_reason: z.string().nullable(),
  classification: z.string().nullable(),
  gas_used: z.string().nullable(),
  created_at: z.string()
});

export const attemptsResponseSchema = z.object({
  attempts: z.array(attemptSchema)
});

export const metricsSummarySchema = z.object({
  deployments: z.array(z.object({ chain_key: z.string(), status: z.string(), count: z.string() })),
  attempts: z.array(z.object({ chain_key: z.string(), count: z.string() })),
  outOfGas: z.array(z.object({ chain_key: z.string(), count: z.string() })),
  avgGasUsed: z.array(z.object({ chain_key: z.string(), avg: z.string().nullable() })),
  avgEstimate: z.array(z.object({ chain_key: z.string(), avg: z.string().nullable() }))
});

export const autonomyDecisionSchema = z.object({
  id: z.string(),
  deploymentId: z.string().nullable().optional(),
  chainKey: z.string(),
  mode: z.string(),
  action: z.string(),
  status: z.string(),
  riskScore: z.number(),
  predictedSuccess: z.number(),
  predictedGasUsed: z.number().nullable().optional(),
  selectedGasLimit: z.number().nullable().optional(),
  selectedMaxRetries: z.number().nullable().optional(),
  rationale: z.record(z.string(), z.any()),
  confidence: z.number(),
  createdAt: z.string()
});

export const autonomyDecisionsResponseSchema = z.object({
  decisions: z.array(autonomyDecisionSchema)
});

export const autonomyEventSchema = z.object({
  id: z.string(),
  chain_key: z.string(),
  event_type: z.string(),
  payload: z.record(z.string(), z.any()),
  created_at: z.string()
});

export const autonomyEventsResponseSchema = z.object({
  events: z.array(autonomyEventSchema)
});

export const autonomyForecastSchema = z.object({
  id: z.string(),
  chainKey: z.string(),
  riskScore: z.number(),
  predictedFailureProbability: z.number(),
  failureTypes: z.array(z.string()),
  confidence: z.number(),
  features: z.record(z.string(), z.any()),
  createdAt: z.string()
});

export const autonomyForecastsResponseSchema = z.object({
  forecasts: z.array(autonomyForecastSchema)
});

export const autonomyPolicyDriftSchema = z.object({
  id: z.string(),
  chainKey: z.string(),
  baseMultiplier: z.number(),
  safetyMarginPercent: z.number(),
  retryMultiplierStep: z.number(),
  reason: z.string().nullable().optional(),
  createdAt: z.string()
});

export const autonomyPolicyDriftResponseSchema = z.object({
  drift: z.array(autonomyPolicyDriftSchema)
});

export const autonomyPolicyHistorySchema = z.object({
  id: z.string(),
  chainKey: z.string(),
  version: z.string(),
  policy: z.record(z.string(), z.any()),
  appliedBy: z.string(),
  status: z.string(),
  metrics: z.record(z.string(), z.any()),
  createdAt: z.string()
});

export const autonomyPolicyHistoryResponseSchema = z.object({
  history: z.array(autonomyPolicyHistorySchema)
});

export const autonomyPreventedSchema = z.object({
  id: z.string(),
  chainKey: z.string(),
  failureType: z.string(),
  riskScore: z.number(),
  action: z.string(),
  reason: z.string().nullable().optional(),
  createdAt: z.string()
});

export const autonomyPreventedResponseSchema = z.object({
  prevented: z.array(autonomyPreventedSchema)
});

export const autonomyStatusSchema = z.object({
  effective: z.object({
    enabled: z.boolean(),
    mode: z.string(),
    maxRisk: z.number(),
    maxGasLimit: z.number(),
    maxRetries: z.number(),
    policyLock: z.boolean()
  }),
  overrides: z
    .object({
      enabled: z.boolean().nullable().optional(),
      mode: z.string().nullable().optional(),
      maxRisk: z.number().nullable().optional(),
      maxGasLimit: z.number().nullable().optional(),
      maxRetries: z.number().nullable().optional(),
      policyLock: z.boolean().nullable().optional(),
      createdAt: z.string().nullable().optional()
    })
    .nullable()
});

export const aiCoreStatusSchema = z.object({
  autonomy: autonomyStatusSchema,
  latest: z.object({
    observation: z
      .object({
        chain_key: z.string(),
        created_at: z.string()
      })
      .nullable()
      .optional(),
    prediction: z
      .object({
        chain_key: z.string(),
        created_at: z.string()
      })
      .nullable()
      .optional(),
    decision: z
      .object({
        chain_key: z.string(),
        created_at: z.string()
      })
      .nullable()
      .optional()
  })
});

export const aiCoreObservationSchema = z.object({
  id: z.string(),
  chainKey: z.string(),
  blockNumber: z.number().nullable(),
  gasLimit: z.number().nullable(),
  gasUsed: z.number().nullable(),
  baseFee: z.number().nullable(),
  blockTime: z.string().nullable(),
  rpcLatencyMs: z.number().nullable(),
  rpcNamespace: z.string().nullable(),
  success: z.boolean(),
  errorMessage: z.string().nullable(),
  createdAt: z.string()
});

export const aiCoreObservationsResponseSchema = z.object({
  observations: z.array(aiCoreObservationSchema)
});

export const aiCorePredictionSchema = z.object({
  id: z.string(),
  chainKey: z.string(),
  riskScore: z.number(),
  predictedFailureProbability: z.number(),
  confidence: z.number(),
  timeHorizonSeconds: z.number(),
  affectedSubsystem: z.string(),
  recommendedAction: z.string(),
  features: z.record(z.string(), z.any()),
  createdAt: z.string()
});

export const aiCorePredictionsResponseSchema = z.object({
  predictions: z.array(aiCorePredictionSchema)
});

export const aiCoreDecisionSchema = z.object({
  id: z.string(),
  chainKey: z.string(),
  mode: z.string(),
  action: z.string(),
  status: z.string(),
  riskScore: z.number(),
  confidence: z.number(),
  forecastId: z.string().nullable().optional(),
  deploymentId: z.string().nullable().optional(),
  rationale: z.record(z.string(), z.any()),
  createdAt: z.string()
});

export const aiCoreDecisionsResponseSchema = z.object({
  decisions: z.array(aiCoreDecisionSchema)
});

export const aiCoreActionSchema = z.object({
  id: z.string(),
  decisionId: z.string().nullable().optional(),
  chainKey: z.string(),
  actionType: z.string(),
  status: z.string(),
  payload: z.record(z.string(), z.any()),
  createdAt: z.string()
});

export const aiCoreActionsResponseSchema = z.object({
  actions: z.array(aiCoreActionSchema)
});

export const aiCoreGovernanceSchema = z.object({
  id: z.string(),
  chainKey: z.string(),
  category: z.string(),
  severity: z.string(),
  summary: z.string(),
  recommendation: z.string(),
  status: z.string(),
  createdAt: z.string(),
  updatedAt: z.string()
});

export const aiCoreGovernanceResponseSchema = z.object({
  recommendations: z.array(aiCoreGovernanceSchema)
});

export const aiCoreFingerprintSchema = z.object({
  fingerprint: z.string(),
  chainKey: z.string(),
  classification: z.string(),
  errorSignature: z.string(),
  occurrences: z.number(),
  firstSeen: z.string(),
  lastSeen: z.string()
});

export const aiCoreFingerprintsResponseSchema = z.object({
  fingerprints: z.array(aiCoreFingerprintSchema)
});

export const aiCoreSuppressionRuleSchema = z.object({
  id: z.string(),
  fingerprint: z.string(),
  chainKey: z.string(),
  active: z.boolean(),
  reason: z.string().nullable(),
  createdAt: z.string()
});

export const aiCoreSuppressionRulesResponseSchema = z.object({
  rules: z.array(aiCoreSuppressionRuleSchema)
});

export const aiCorePolicyConstraintsSchema = z.object({
  chainKey: z.string(),
  maxRisk: z.number().nullable().optional(),
  maxGasLimit: z.number().nullable().optional(),
  maxRetries: z.number().nullable().optional(),
  allowedActions: z.array(z.string()).nullable().optional(),
  createdAt: z.string().nullable().optional()
});

export const aiCorePolicyConstraintsResponseSchema = z.object({
  constraints: aiCorePolicyConstraintsSchema.nullable()
});

const numericLike = z.union([z.number(), z.string()]);

export const gasUnitsSchema = z.object({
  gasTokenSymbol: z.string(),
  gasTokenAddress: z.string(),
  gasTokenDecimals: z.number().int()
});

export const gasFeePolicySchema = z.object({
  chainKey: z.string(),
  maxBaseFee: z.number(),
  maxPriorityFee: z.number(),
  spikeThresholdBps: z.number(),
  windowSeconds: z.number(),
  violationPenaltyBps: z.number(),
  minBond: z.number(),
  autoExecEnabled: z.boolean()
});

export const gasRecommendationSchema = z.object({
  recommendedBaseFee: numericLike,
  recommendedPriorityFee: numericLike,
  volatilityScore: z.number(),
  anomalyScore: z.number(),
  drivers: z.preprocess((value) => value ?? {}, z.record(z.string(), z.number())),
  policyBounds: z.preprocess((value) => value ?? {}, z.record(z.string(), z.number())),
  createdAt: z.string()
});

export const gasRecommendationResponseSchema = z.object({
  chain: chainSchema,
  policy: gasFeePolicySchema,
  recommendation: gasRecommendationSchema,
  units: gasUnitsSchema
});

export const gasSampleSchema = z.object({
  blockNumber: numericLike.nullable().optional(),
  baseFee: numericLike.nullable().optional(),
  priorityFee: numericLike.nullable().optional(),
  gasUsedRatio: z.number().nullable(),
  observedAt: z.string(),
  source: z.string()
});

export const gasMetricsResponseSchema = z.object({
  chain: chainSchema,
  policy: gasFeePolicySchema,
  recommendation: gasRecommendationSchema.nullable(),
  samples: z.array(gasSampleSchema),
  units: gasUnitsSchema
});

export const slashingEventSchema = z.object({
  operator: z.string().nullable().optional(),
  violationId: numericLike.nullable().optional(),
  reasonCode: z.number().nullable().optional(),
  slashAmount: numericLike.nullable().optional(),
  status: z.string(),
  evidence: z.preprocess((value) => value ?? {}, z.record(z.string(), z.any())),
  createdAt: z.string()
});

export const slashingEventsResponseSchema = z.object({
  chain: chainSchema,
  events: z.array(slashingEventSchema),
  units: gasUnitsSchema
});

export const deploymentDetailSchema = z.object({
  deployment: deploymentSchema,
  decision: autonomyDecisionSchema.nullable().optional(),
  attempts: z.number()
});

export async function fetchGasJson<T>(path: string, schema: z.ZodSchema<T>): Promise<{ data?: T; error?: string }> {
  const url = `${baseUrl()}${path}`;
  const headers: Record<string, string> = {
    'content-type': 'application/json',
    traceparent: traceparent()
  };

  let res: Response;
  try {
    res = await fetch(url, { headers, cache: 'no-store' });
  } catch {
    return {
      error: `${path} failed: network_error. Hint: Check GAS_ENGINE_URL (${baseUrl()}) and service health.`
    };
  }

  if (!res.ok) {
    const payload = await res.json().catch(() => ({}));
    const parsed = errorSchema.safeParse(payload);
    const hint = parsed.success ? parsed.data.hint : undefined;
    const statusLabel = `HTTP ${res.status}`;
    const message = parsed.success ? parsed.data.error : statusLabel;
    return {
      error: `${path} failed: ${message}${parsed.success ? ` (${statusLabel})` : ''}${hint ? `. Hint: ${hint}` : ''}`
    };
  }

  const json = await res.json();
  const parsed = schema.safeParse(json);
  if (!parsed.success) {
    return { error: `${path} failed: invalid_response_shape` };
  }
  return { data: parsed.data };
}

export async function postGasAdminJson<T>(
  path: string,
  body: unknown,
  schema: z.ZodSchema<T>
): Promise<{ data?: T; error?: string }> {
  const url = path.startsWith('http') ? path : path;
  const headers: Record<string, string> = {
    'content-type': 'application/json',
    traceparent: traceparent()
  };

  let res: Response;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      cache: 'no-store',
      credentials: 'include'
    });
  } catch {
    return { error: `${path} failed: network_error` };
  }

  const payload = await res.json().catch(() => ({}));
  if (!res.ok) {
    const parsed = errorSchema.safeParse(payload);
    const hint = parsed.success ? parsed.data.hint : undefined;
    const statusLabel = `HTTP ${res.status}`;
    const message = parsed.success ? parsed.data.error : statusLabel;
    return { error: `${path} failed: ${message}${hint ? `. Hint: ${hint}` : ''}` };
  }

  const parsed = schema.safeParse(payload);
  if (!parsed.success) {
    return { error: `${path} failed: invalid_response_shape` };
  }
  return { data: parsed.data };
}
