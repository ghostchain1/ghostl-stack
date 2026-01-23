import { z } from 'zod';
import { apiRequest, type ApiResult } from './api';

const baseUrl = () => {
  if (typeof window === 'undefined') {
    return process.env.PIL_URL || process.env.NEXT_PUBLIC_PIL_URL || 'http://ghost-pil:3220';
  }
  return process.env.NEXT_PUBLIC_PIL_URL || 'http://localhost:3220';
};

export const chainSchema = z.object({
  chainId: z.string(),
  chainKey: z.string(),
  name: z.string(),
  type: z.string(),
  gasTokenSymbol: z.string(),
  rpcUrlRef: z.string(),
  lastBlockNumber: z.string().nullable().optional(),
  lastBlockHash: z.string().nullable().optional(),
  lastIngestedAt: z.string().nullable().optional()
});

export const chainsResponseSchema = z.object({
  chains: z.array(chainSchema)
});

export const ingestStatusSchema = z.object({
  ingestEnabled: z.boolean(),
  intervalSeconds: z.number(),
  maxBlocksPerTick: z.number(),
  chains: z.array(
    z.object({
      chainId: z.string(),
      chainKey: z.string(),
      name: z.string(),
      lastBlockNumber: z.string().nullable().optional(),
      lastBlockHash: z.string().nullable().optional(),
      lastIngestedAt: z.string().nullable().optional(),
      lastError: z.string().nullable().optional()
    })
  )
});

export const jurisdictionSchema = z.object({
  code: z.string(),
  name: z.string(),
  region: z.string(),
  riskTier: z.string(),
  regulatoryProfile: z.unknown(),
  updatedAt: z.string()
});

export const jurisdictionsResponseSchema = z.object({
  jurisdictions: z.array(jurisdictionSchema)
});

export const legalSignalSchema = z.object({
  id: z.string(),
  jurisdictionCode: z.string(),
  category: z.string(),
  severity: z.string(),
  confidence: z.number(),
  detectedAt: z.string(),
  summary: z.string(),
  sourceRefs: z.unknown()
});

export const legalSignalsResponseSchema = z.object({
  signals: z.array(legalSignalSchema)
});

export const metricsSummarySchema = z.object({
  totals: z.object({
    blocks: z.string(),
    txs: z.string(),
    receipts: z.string(),
    traces: z.string(),
    complianceDecisions: z.string(),
    attestations: z.string().optional()
  })
});

export const simulationSchema = z.object({
  id: z.string(),
  chain_id: z.string(),
  horizon: z.string(),
  params_json: z.unknown(),
  model_version: z.string(),
  status: z.string(),
  created_at: z.string()
});

export const simulationsResponseSchema = z.object({
  simulations: z.array(simulationSchema)
});

export const recommendationSchema = z.object({
  id: z.string(),
  chain_id: z.string(),
  recommendation_type: z.string(),
  summary: z.string(),
  rationale: z.string(),
  risks: z.array(z.string()),
  confidence: z.string(),
  sim_run_ids: z.array(z.string()),
  rollback_plan: z.string().nullable(),
  required_approvals: z.number(),
  status: z.string(),
  created_at: z.string()
});

export const recommendationsResponseSchema = z.object({
  recommendations: z.array(recommendationSchema)
});

export const validatorScoreSchema = z.object({
  validatorId: z.string(),
  chainId: z.string(),
  jurisdictionCode: z.string(),
  score: z.number(),
  reason: z.string().nullable().optional(),
  updatedAt: z.string()
});

export const validatorScoresResponseSchema = z.object({
  validators: z.array(validatorScoreSchema)
});

export const policyPackSchema = z.object({
  id: z.string(),
  jurisdictionCode: z.string(),
  version: z.string(),
  generatedBy: z.string(),
  confidenceScore: z.string(),
  effectiveFrom: z.string(),
  sunsetAt: z.string().nullable(),
  status: z.string(),
  createdAt: z.string(),
  rules: z.unknown(),
  sourceRefs: z.unknown(),
  simulationReport: z.unknown().nullable().optional()
});

export const policyPacksResponseSchema = z.object({
  policyPacks: z.array(policyPackSchema)
});

export async function fetchPil<T>(path: string, schema: z.ZodSchema<T>): Promise<ApiResult<T>> {
  return apiRequest<T>(path, {
    baseUrl: baseUrl(),
    schema,
    init: { method: 'GET', cache: 'no-store' }
  });
}
