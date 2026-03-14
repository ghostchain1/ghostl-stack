import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { config, loadChains, type ChainConfig } from '../config.js';
import { query } from '../db/index.js';
import { loadFeePolicy } from '../fees/recommendations.js';

const chainQuerySchema = z.object({
  chain: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(200).optional()
});

const parseJson = <T>(value: unknown, fallback: T): T => {
  if (value == null) return fallback;
  if (typeof value === 'object') return value as T;
  if (typeof value !== 'string') return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
};

const resolveChain = (chainParam?: string): ChainConfig => {
  const chains = loadChains();
  if (!chainParam) {
    const l1 = chains.find((chain) => chain.type === 'L1');
    if (l1) return l1;
    return chains[0]!;
  }
  const key = chainParam.toLowerCase();
  const direct = chains.find((chain) => chain.key.toLowerCase() === key);
  if (direct) return direct;
  const byType = chains.find((chain) => chain.type.toLowerCase() === key);
  if (byType) return byType;
  throw new Error(`unknown_chain:${chainParam}`);
};

const chainPayload = (chain: ChainConfig) => ({
  key: chain.key,
  chainId: chain.chainId,
  name: chain.name,
  type: chain.type,
  gasTokenSymbol: chain.gasTokenSymbol,
  gasTokenAddress: chain.gasTokenAddress,
  gasTokenName: chain.gasTokenName,
  gasTokenDecimals: chain.gasTokenDecimals
});

export async function registerGasRoutes(app: FastifyInstance) {
  app.get('/v1/gas/recommendations', async (req, reply) => {
    const parsed = chainQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      reply.code(400);
      return { error: 'invalid_query', details: parsed.error.flatten() };
    }

    let chain: ChainConfig;
    try {
      chain = resolveChain(parsed.data.chain);
    } catch (err) {
      reply.code(404);
      return { error: (err as Error).message };
    }

    const [policy, recommendations] = await Promise.all([
      loadFeePolicy(chain.key),
      query<{
        recommended_base_fee: string;
        recommended_priority_fee: string;
        volatility_score: string;
        anomaly_score: string;
        drivers: unknown;
        policy_bounds: unknown;
        created_at: string;
      }>(
        `SELECT recommended_base_fee, recommended_priority_fee, volatility_score, anomaly_score, drivers, policy_bounds, created_at
         FROM gas_fee_recommendations
         WHERE chain_key = $1
         ORDER BY created_at DESC
         LIMIT 1`,
        [chain.key]
      )
    ]);

    const latest = recommendations[0];
    if (!latest) {
      reply.code(404);
      return { error: 'no_recommendation' };
    }

    return {
      chain: chainPayload(chain),
      policy,
      recommendation: {
        recommendedBaseFee: latest.recommended_base_fee,
        recommendedPriorityFee: latest.recommended_priority_fee,
        volatilityScore: Number(latest.volatility_score),
        anomalyScore: Number(latest.anomaly_score),
        drivers: parseJson<Record<string, number>>(latest.drivers, {}),
        policyBounds: parseJson<Record<string, number>>(latest.policy_bounds, {}),
        createdAt: latest.created_at
      },
      units: {
        gasTokenSymbol: chain.gasTokenSymbol,
        gasTokenAddress: chain.gasTokenAddress,
        gasTokenDecimals: chain.gasTokenDecimals ?? 18
      }
    };
  });

  app.get('/v1/gas/metrics', async (req, reply) => {
    const parsed = chainQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      reply.code(400);
      return { error: 'invalid_query', details: parsed.error.flatten() };
    }

    let chain: ChainConfig;
    try {
      chain = resolveChain(parsed.data.chain);
    } catch (err) {
      reply.code(404);
      return { error: (err as Error).message };
    }

    const limit = parsed.data.limit ?? config.FEE_WATCHER_WINDOW_SIZE;
    const [policy, samples, recommendation] = await Promise.all([
      loadFeePolicy(chain.key),
      query<{
        block_number: string | null;
        base_fee: string | null;
        priority_fee: string | null;
        gas_used_ratio: string | null;
        observed_at: string;
        source: string;
      }>(
        `SELECT block_number, base_fee, priority_fee, gas_used_ratio, observed_at, source
         FROM gas_fee_samples
         WHERE chain_key = $1
         ORDER BY observed_at DESC
         LIMIT $2`,
        [chain.key, limit]
      ),
      query<{
        recommended_base_fee: string;
        recommended_priority_fee: string;
        volatility_score: string;
        anomaly_score: string;
        created_at: string;
      }>(
        `SELECT recommended_base_fee, recommended_priority_fee, volatility_score, anomaly_score, created_at
         FROM gas_fee_recommendations
         WHERE chain_key = $1
         ORDER BY created_at DESC
         LIMIT 1`,
        [chain.key]
      )
    ]);

    return {
      chain: chainPayload(chain),
      policy,
      recommendation: recommendation[0]
        ? {
            recommendedBaseFee: recommendation[0].recommended_base_fee,
            recommendedPriorityFee: recommendation[0].recommended_priority_fee,
            volatilityScore: Number(recommendation[0].volatility_score),
            anomalyScore: Number(recommendation[0].anomaly_score),
            createdAt: recommendation[0].created_at
          }
        : null,
      samples: samples.map((sample) => ({
        blockNumber: sample.block_number,
        baseFee: sample.base_fee,
        priorityFee: sample.priority_fee,
        gasUsedRatio: sample.gas_used_ratio ? Number(sample.gas_used_ratio) : null,
        observedAt: sample.observed_at,
        source: sample.source
      })),
      units: {
        gasTokenSymbol: chain.gasTokenSymbol,
        gasTokenAddress: chain.gasTokenAddress,
        gasTokenDecimals: chain.gasTokenDecimals ?? 18
      }
    };
  });

  app.get('/v1/gas/policy', async (req, reply) => {
    const parsed = chainQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      reply.code(400);
      return { error: 'invalid_query', details: parsed.error.flatten() };
    }

    let chain: ChainConfig;
    try {
      chain = resolveChain(parsed.data.chain);
    } catch (err) {
      reply.code(404);
      return { error: (err as Error).message };
    }

    const policy = await loadFeePolicy(chain.key);
    return {
      chain: chainPayload(chain),
      policy,
      units: {
        gasTokenSymbol: chain.gasTokenSymbol,
        gasTokenAddress: chain.gasTokenAddress,
        gasTokenDecimals: chain.gasTokenDecimals ?? 18
      }
    };
  });

  const slashingEventsHandler = async (req: FastifyRequest, reply: FastifyReply) => {
    const parsed = chainQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      reply.code(400);
      return { error: 'invalid_query', details: parsed.error.flatten() };
    }

    let chain: ChainConfig;
    try {
      chain = resolveChain(parsed.data.chain);
    } catch (err) {
      reply.code(404);
      return { error: (err as Error).message };
    }

    const limit = parsed.data.limit ?? 50;
    const events = await query<{
      operator: string | null;
      violation_id: string | null;
      reason_code: number | null;
      slash_amount: string | null;
      status: string;
      evidence: unknown;
      created_at: string;
    }>(
      `SELECT operator, violation_id, reason_code, slash_amount, status, evidence, created_at
       FROM gas_slashing_events
       WHERE chain_key = $1
       ORDER BY created_at DESC
       LIMIT $2`,
      [chain.key, limit]
    );

    return {
      chain: chainPayload(chain),
      events: events.map((event) => ({
        operator: event.operator,
        violationId: event.violation_id,
        reasonCode: event.reason_code,
        slashAmount: event.slash_amount,
        status: event.status,
        evidence: parseJson<Record<string, unknown>>(event.evidence, {}),
        createdAt: event.created_at
      })),
      units: {
        gasTokenSymbol: chain.gasTokenSymbol,
        gasTokenAddress: chain.gasTokenAddress,
        gasTokenDecimals: chain.gasTokenDecimals ?? 18
      }
    };
  };

  app.get('/v1/slashing/events', slashingEventsHandler);
  // Compatibility alias: keep slashing data under the /v1/gas namespace.
  app.get('/v1/gas/slashing-events', slashingEventsHandler);
}
