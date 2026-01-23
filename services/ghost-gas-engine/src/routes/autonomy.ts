import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { config } from '../config.js';
import { query } from '../db/index.js';
import { deploymentQueue } from '../jobs/queue.js';
import { getAutonomyOverrides, getDecisionById, saveAutonomyOverride, updateDecisionStatus } from '../autonomy/store.js';
import { resolveAutonomyConfig } from '../autonomy/engine.js';

const overrideSchema = z.object({
  enabled: z.union([z.boolean(), z.null()]).optional(),
  mode: z
    .enum(['OBSERVE_ONLY', 'ADVISORY', 'ASSISTED', 'AUTONOMOUS', 'AUTONOMOUS_STRICT', 'DRY_RUN'])
    .nullable()
    .optional(),
  maxRisk: z.union([z.number().min(0).max(1), z.null()]).optional(),
  maxGasLimit: z.union([z.number().min(1), z.null()]).optional(),
  maxRetries: z.union([z.number().int().min(0), z.null()]).optional(),
  policyLock: z.union([z.boolean(), z.null()]).optional()
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
  const queryParams = req.query as { limit?: string; chainKey?: string };
  const rawLimit = Number(queryParams.limit || 50);
  const limit = Number.isFinite(rawLimit) ? Math.min(rawLimit, 200) : 50;
  return { limit, chainKey: queryParams.chainKey };
};

export async function registerAutonomyRoutes(app: FastifyInstance) {
  app.get('/v1/autonomy/status', async () => {
    const overrides = await getAutonomyOverrides();
    const effective = resolveAutonomyConfig(overrides);
    return { effective, overrides };
  });

  app.get('/v1/autonomy/decisions', async (req) => {
    const { limit, chainKey } = parseListQuery(req);
    const values: Array<string | number> = [limit];
    const where = chainKey ? 'WHERE chain_key = $2' : '';
    if (chainKey) values.push(chainKey);
    const rows = await query<{
      id: string;
      deployment_id: string | null;
      chain_key: string;
      mode: string;
      action: string;
      status: string;
      risk_score: string;
      predicted_success: string;
      predicted_gas_used: string | null;
      selected_gas_limit: string | null;
      selected_max_retries: number | null;
      rationale: Record<string, unknown>;
      confidence: string;
      created_at: string;
    }>(
      `SELECT id, deployment_id, chain_key, mode, action, status, risk_score, predicted_success, predicted_gas_used,
              selected_gas_limit, selected_max_retries, rationale, confidence, created_at
       FROM gas_autonomy_decisions ${where}
       ORDER BY created_at DESC LIMIT $1`,
      values
    );
    const decisions = rows.map((row) => ({
      id: row.id,
      deploymentId: row.deployment_id,
      chainKey: row.chain_key,
      mode: row.mode,
      action: row.action,
      status: row.status,
      riskScore: Number(row.risk_score),
      predictedSuccess: Number(row.predicted_success),
      predictedGasUsed: row.predicted_gas_used ? Number(row.predicted_gas_used) : null,
      selectedGasLimit: row.selected_gas_limit ? Number(row.selected_gas_limit) : null,
      selectedMaxRetries: row.selected_max_retries ?? null,
      rationale: row.rationale || {},
      confidence: Number(row.confidence),
      createdAt: row.created_at
    }));
    return { decisions };
  });

  app.get('/v1/autonomy/events', async (req) => {
    const { limit, chainKey } = parseListQuery(req);
    const values: Array<string | number> = [limit];
    const where = chainKey ? 'WHERE chain_key = $2' : '';
    if (chainKey) values.push(chainKey);
    const rows = await query<{
      id: string;
      chain_key: string;
      event_type: string;
      payload: Record<string, unknown>;
      created_at: string;
    }>(
      `SELECT id, chain_key, event_type, payload, created_at
       FROM gas_autonomy_events ${where}
       ORDER BY created_at DESC LIMIT $1`,
      values
    );
    return { events: rows };
  });

  app.get('/v1/autonomy/risk-forecasts', async (req) => {
    const { limit, chainKey } = parseListQuery(req);
    const values: Array<string | number> = [limit];
    const where = chainKey ? 'WHERE chain_key = $2' : '';
    if (chainKey) values.push(chainKey);
    const rows = await query<{
      id: string;
      chain_key: string;
      risk_score: string;
      predicted_failure_probability: string;
      failure_types: string[] | null;
      confidence: string;
      features: Record<string, unknown> | null;
      created_at: string;
    }>(
      `SELECT id, chain_key, risk_score, predicted_failure_probability, failure_types, confidence, features, created_at
       FROM gas_risk_forecasts ${where}
       ORDER BY created_at DESC LIMIT $1`,
      values
    );
    const forecasts = rows.map((row) => ({
      id: row.id,
      chainKey: row.chain_key,
      riskScore: Number(row.risk_score),
      predictedFailureProbability: Number(row.predicted_failure_probability),
      failureTypes: row.failure_types || [],
      confidence: Number(row.confidence),
      features: row.features || {},
      createdAt: row.created_at
    }));
    return { forecasts };
  });

  app.get('/v1/autonomy/policy-drift', async (req) => {
    const { limit, chainKey } = parseListQuery(req);
    const values: Array<string | number> = [limit];
    const where = chainKey ? 'WHERE chain_key = $2' : '';
    if (chainKey) values.push(chainKey);
    const rows = await query<{
      id: string;
      chain_key: string;
      base_multiplier: string;
      safety_margin_percent: string;
      retry_multiplier_step: string;
      reason: string | null;
      created_at: string;
    }>(
      `SELECT id, chain_key, base_multiplier, safety_margin_percent, retry_multiplier_step, reason, created_at
       FROM gas_policy_drift ${where}
       ORDER BY created_at DESC LIMIT $1`,
      values
    );
    const drift = rows.map((row) => ({
      id: row.id,
      chainKey: row.chain_key,
      baseMultiplier: Number(row.base_multiplier),
      safetyMarginPercent: Number(row.safety_margin_percent),
      retryMultiplierStep: Number(row.retry_multiplier_step),
      reason: row.reason,
      createdAt: row.created_at
    }));
    return { drift };
  });

  app.get('/v1/autonomy/policy-history', async (req) => {
    const { limit, chainKey } = parseListQuery(req);
    const values: Array<string | number> = [limit];
    const where = chainKey ? 'WHERE chain_key = $2' : '';
    if (chainKey) values.push(chainKey);
    const rows = await query<{
      id: string;
      chain_key: string;
      version: string;
      policy: Record<string, unknown>;
      applied_by: string;
      status: string;
      metrics: Record<string, unknown> | null;
      created_at: string;
    }>(
      `SELECT id, chain_key, version, policy, applied_by, status, metrics, created_at
       FROM gas_policy_history ${where}
       ORDER BY created_at DESC LIMIT $1`,
      values
    );
    const history = rows.map((row) => ({
      id: row.id,
      chainKey: row.chain_key,
      version: row.version,
      policy: row.policy,
      appliedBy: row.applied_by,
      status: row.status,
      metrics: row.metrics || {},
      createdAt: row.created_at
    }));
    return { history };
  });

  app.get('/v1/autonomy/prevented-failures', async (req) => {
    const { limit, chainKey } = parseListQuery(req);
    const values: Array<string | number> = [limit];
    const where = chainKey ? 'WHERE chain_key = $2' : '';
    if (chainKey) values.push(chainKey);
    const rows = await query<{
      id: string;
      chain_key: string;
      failure_type: string;
      risk_score: string;
      action: string;
      reason: string | null;
      created_at: string;
    }>(
      `SELECT id, chain_key, failure_type, risk_score, action, reason, created_at
       FROM gas_prevented_failures ${where}
       ORDER BY created_at DESC LIMIT $1`,
      values
    );
    const prevented = rows.map((row) => ({
      id: row.id,
      chainKey: row.chain_key,
      failureType: row.failure_type,
      riskScore: Number(row.risk_score),
      action: row.action,
      reason: row.reason,
      createdAt: row.created_at
    }));
    return { prevented };
  });

  app.post('/v1/autonomy/override', async (req, reply) => {
    if (!requireAdmin(req, reply)) return;
    const parsed = overrideSchema.safeParse(req.body);
    if (!parsed.success) {
      reply.code(400).send({ error: 'invalid_request', details: parsed.error.flatten() });
      return;
    }
    await saveAutonomyOverride(parsed.data);
    const overrides = await getAutonomyOverrides();
    const effective = resolveAutonomyConfig(overrides);
    return { effective, overrides };
  });

  app.post('/v1/autonomy/decisions/:id/approve', async (req, reply) => {
    if (!requireAdmin(req, reply)) return;
    const { id } = req.params as { id: string };
    const decision = await getDecisionById(id);
    if (!decision) {
      reply.code(404).send({ error: 'decision_not_found' });
      return;
    }
    if (decision.action !== 'needs_approval') {
      reply.code(409).send({ error: 'decision_not_approvable' });
      return;
    }
    if (!decision.deploymentId) {
      reply.code(409).send({ error: 'decision_missing_deployment' });
      return;
    }
    const deployment = await query<{
      id: string;
      chain_key: string;
      name: string | null;
      tx_request: Record<string, unknown> | null;
      raw_tx: string | null;
      foundry_path: string | null;
      foundry_index: number | null;
      mode: string | null;
    }>(
      `SELECT id, chain_key, name, tx_request, raw_tx, foundry_path, foundry_index, mode
       FROM gas_deployments WHERE id = $1`,
      [decision.deploymentId]
    );
    if (!deployment[0]) {
      reply.code(404).send({ error: 'deployment_not_found' });
      return;
    }
    await updateDecisionStatus(decision.id, 'approved');
    await deploymentQueue.add('deploy', {
      deploymentId: deployment[0].id,
      chainKey: deployment[0].chain_key,
      name: deployment[0].name || undefined,
      txRequest: deployment[0].tx_request || undefined,
      rawTx: deployment[0].raw_tx || undefined,
      foundry: deployment[0].foundry_path
        ? { path: deployment[0].foundry_path, txIndex: deployment[0].foundry_index ?? undefined }
        : undefined,
      mode: decision.mode,
      decisionId: decision.id,
      approved: true
    });
    await query('UPDATE gas_deployments SET status = $1, updated_at = now() WHERE id = $2', [
      'queued',
      deployment[0].id
    ]);
    return { deploymentId: deployment[0].id, decisionId: decision.id, status: 'queued' };
  });

  app.post('/v1/autonomy/decisions/:id/replay', async (req, reply) => {
    if (!requireAdmin(req, reply)) return;
    const { id } = req.params as { id: string };
    const decision = await getDecisionById(id);
    if (!decision) {
      reply.code(404).send({ error: 'decision_not_found' });
      return;
    }
    if (!decision.deploymentId) {
      reply.code(409).send({ error: 'decision_missing_deployment' });
      return;
    }
    const deployment = await query<{
      id: string;
      chain_key: string;
      name: string | null;
      tx_request: Record<string, unknown> | null;
      raw_tx: string | null;
      foundry_path: string | null;
      foundry_index: number | null;
      mode: string | null;
    }>(
      `SELECT id, chain_key, name, tx_request, raw_tx, foundry_path, foundry_index, mode
       FROM gas_deployments WHERE id = $1`,
      [decision.deploymentId]
    );
    if (!deployment[0]) {
      reply.code(404).send({ error: 'deployment_not_found' });
      return;
    }
    await deploymentQueue.add('deploy', {
      deploymentId: deployment[0].id,
      chainKey: deployment[0].chain_key,
      name: deployment[0].name || undefined,
      txRequest: deployment[0].tx_request || undefined,
      rawTx: deployment[0].raw_tx || undefined,
      foundry: deployment[0].foundry_path
        ? { path: deployment[0].foundry_path, txIndex: deployment[0].foundry_index ?? undefined }
        : undefined,
      mode: decision.mode,
      decisionId: decision.id,
      approved: true
    });
    await query('UPDATE gas_deployments SET status = $1, updated_at = now() WHERE id = $2', [
      'queued',
      deployment[0].id
    ]);
    return { deploymentId: deployment[0].id, decisionId: decision.id, status: 'queued' };
  });
}
