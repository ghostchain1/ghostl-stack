import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { config } from '../config.js';
import { query } from '../db/index.js';
import { getAutonomyOverrides } from '../autonomy/store.js';
import { resolveAutonomyConfig } from '../autonomy/engine.js';
import {
  getPolicyConstraints,
  listActions,
  listDecisions,
  listFingerprints,
  listGovernanceRecommendations,
  listObservations,
  listPlaybooks,
  listPredictions,
  listSuppressionRules,
  recordAiEvent,
  upsertPolicyConstraints,
  updateGovernanceRecommendation
} from '../ai-core/store.js';

const constraintsSchema = z.object({
  chainKey: z.string(),
  maxRisk: z.number().min(0).max(1).optional(),
  maxGasLimit: z.number().min(1).optional(),
  maxRetries: z.number().int().min(0).optional(),
  allowedActions: z.array(z.enum(['ALLOW', 'MODIFY', 'RETRY', 'DEFER', 'BLOCK', 'ESCALATE'])).optional()
});

const requireAdmin = (req: FastifyRequest, reply: FastifyReply): boolean => {
  if (!config.ADMIN_TOKEN) {
    reply.code(503).send({ error: 'admin_token_missing', hint: 'Set GAS_ENGINE_ADMIN_TOKEN to enable admin actions.' });
    return false;
  }
  const header = req.headers['x-admin-token'];
  const bearer = typeof req.headers.authorization === 'string' ? req.headers.authorization : '';
  const token = header || bearer.replace(/^Bearer\s+/i, '');
  if (!token || token !== config.ADMIN_TOKEN) {
    reply.code(401).send({ error: 'unauthorized', hint: 'Missing or invalid admin token.' });
    return false;
  }
  return true;
};

const parseListQuery = (req: FastifyRequest) => {
  const queryParams = req.query as { limit?: string; chainKey?: string; status?: string };
  const rawLimit = Number(queryParams.limit || 50);
  const limit = Number.isFinite(rawLimit) ? Math.min(rawLimit, 200) : 50;
  return { limit, chainKey: queryParams.chainKey, status: queryParams.status };
};

export async function registerAiCoreRoutes(app: FastifyInstance) {
  app.get('/v1/ai-core/status', async () => {
    const overrides = await getAutonomyOverrides();
    const effective = resolveAutonomyConfig(overrides);
    const latestObservation = await query<{ chain_key: string; created_at: string }>(
      'SELECT chain_key, created_at FROM ai_chain_observations ORDER BY created_at DESC LIMIT 1'
    );
    const latestPrediction = await query<{ chain_key: string; created_at: string }>(
      'SELECT chain_key, created_at FROM ai_risk_predictions ORDER BY created_at DESC LIMIT 1'
    );
    const latestDecision = await query<{ chain_key: string; created_at: string }>(
      'SELECT chain_key, created_at FROM ai_core_decisions ORDER BY created_at DESC LIMIT 1'
    );
    return {
      autonomy: { effective, overrides },
      latest: {
        observation: latestObservation[0] || null,
        prediction: latestPrediction[0] || null,
        decision: latestDecision[0] || null
      }
    };
  });

  app.get('/v1/ai-core/observations', async (req) => {
    const { limit, chainKey } = parseListQuery(req);
    const rows = await listObservations(chainKey, limit);
    return {
      observations: rows.map((row: any) => ({
        id: row.id,
        chainKey: row.chain_key,
        blockNumber: row.block_number ? Number(row.block_number) : null,
        gasLimit: row.gas_limit ? Number(row.gas_limit) : null,
        gasUsed: row.gas_used ? Number(row.gas_used) : null,
        baseFee: row.base_fee ? Number(row.base_fee) : null,
        blockTime: row.block_time,
        rpcLatencyMs: row.rpc_latency_ms ?? null,
        rpcNamespace: row.rpc_namespace ?? null,
        success: row.success,
        errorMessage: row.error_message ?? null,
        createdAt: row.created_at
      }))
    };
  });

  app.get('/v1/ai-core/predictions', async (req) => {
    const { limit, chainKey } = parseListQuery(req);
    const rows = await listPredictions(chainKey, limit);
    return {
      predictions: rows.map((row: any) => ({
        id: row.id,
        chainKey: row.chain_key,
        riskScore: Number(row.risk_score),
        predictedFailureProbability: Number(row.predicted_failure_probability),
        confidence: Number(row.confidence),
        timeHorizonSeconds: row.time_horizon_seconds,
        affectedSubsystem: row.affected_subsystem,
        recommendedAction: row.recommended_action,
        features: row.features || {},
        createdAt: row.created_at
      }))
    };
  });

  app.get('/v1/ai-core/decisions', async (req) => {
    const { limit, chainKey } = parseListQuery(req);
    const rows = await listDecisions(chainKey, limit);
    return {
      decisions: rows.map((row: any) => ({
        id: row.id,
        chainKey: row.chain_key,
        mode: row.mode,
        action: row.action,
        status: row.status,
        riskScore: Number(row.risk_score),
        confidence: Number(row.confidence),
        forecastId: row.forecast_id,
        deploymentId: row.deployment_id,
        rationale: row.rationale || {},
        createdAt: row.created_at
      }))
    };
  });

  app.get('/v1/ai-core/actions', async (req) => {
    const { limit, chainKey } = parseListQuery(req);
    const rows = await listActions(chainKey, limit);
    return {
      actions: rows.map((row: any) => ({
        id: row.id,
        decisionId: row.decision_id,
        chainKey: row.chain_key,
        actionType: row.action_type,
        status: row.status,
        payload: row.payload || {},
        createdAt: row.created_at
      }))
    };
  });

  app.get('/v1/ai-core/fingerprints', async (req) => {
    const { limit, chainKey } = parseListQuery(req);
    const rows = await listFingerprints(chainKey, limit);
    return {
      fingerprints: rows.map((row: any) => ({
        fingerprint: row.fingerprint,
        chainKey: row.chain_key,
        classification: row.classification,
        errorSignature: row.error_signature,
        occurrences: Number(row.occurrences),
        firstSeen: row.first_seen,
        lastSeen: row.last_seen
      }))
    };
  });

  app.get('/v1/ai-core/suppression-rules', async (req) => {
    const { limit, chainKey } = parseListQuery(req);
    const rows = await listSuppressionRules(chainKey, limit);
    return {
      rules: rows.map((row: any) => ({
        id: row.id,
        fingerprint: row.fingerprint,
        chainKey: row.chain_key,
        active: row.active,
        reason: row.reason,
        createdAt: row.created_at
      }))
    };
  });

  app.get('/v1/ai-core/playbooks', async (req) => {
    const { limit } = parseListQuery(req);
    const rows = await listPlaybooks(limit);
    return {
      playbooks: rows.map((row: any) => ({
        id: row.id,
        title: row.title,
        description: row.description,
        steps: row.steps || {},
        createdAt: row.created_at
      }))
    };
  });

  app.get('/v1/ai-core/governance', async (req) => {
    const { limit, chainKey, status } = parseListQuery(req);
    const rows = await listGovernanceRecommendations(chainKey, status, limit);
    return {
      recommendations: rows.map((row: any) => ({
        id: row.id,
        chainKey: row.chain_key,
        category: row.category,
        severity: row.severity,
        summary: row.summary,
        recommendation: row.recommendation,
        status: row.status,
        createdAt: row.created_at,
        updatedAt: row.updated_at
      }))
    };
  });

  app.post('/v1/ai-core/governance/:id/ack', async (req, reply) => {
    if (!requireAdmin(req, reply)) return;
    const { id } = req.params as { id: string };
    await updateGovernanceRecommendation(id, 'acknowledged');
    await recordAiEvent('system', 'govern', 'recommendation_ack', { recommendationId: id });
    return { id, status: 'acknowledged' };
  });

  app.get('/v1/ai-core/policy-constraints', async (req) => {
    const { chainKey } = parseListQuery(req);
    if (!chainKey) {
      return { constraints: null };
    }
    const constraints = await getPolicyConstraints(chainKey);
    return { constraints };
  });

  app.post('/v1/ai-core/policy-constraints', async (req, reply) => {
    if (!requireAdmin(req, reply)) return;
    const parsed = constraintsSchema.safeParse(req.body);
    if (!parsed.success) {
      reply.code(400).send({ error: 'invalid_request', details: parsed.error.flatten() });
      return;
    }
    await upsertPolicyConstraints(parsed.data);
    await recordAiEvent(parsed.data.chainKey, 'govern', 'policy_constraints_updated', parsed.data);
    return { constraints: parsed.data };
  });
}
