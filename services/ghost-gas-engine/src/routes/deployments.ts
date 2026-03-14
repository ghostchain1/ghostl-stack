import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { query } from '../db/index.js';
import { deploymentQueue } from '../jobs/queue.js';

const foundrySchema = z.object({
  path: z.string(),
  txIndex: z.number().int().min(0).optional()
});

const createSchema = z
  .object({
    chainKey: z.string(),
    name: z.string().optional(),
    mode: z
      .enum(['OBSERVE_ONLY', 'ADVISORY', 'ASSISTED', 'AUTONOMOUS', 'AUTONOMOUS_STRICT', 'DRY_RUN'])
      .optional(),
    txRequest: z.record(z.any()).optional(),
    rawTx: z.string().optional(),
    foundry: foundrySchema.optional(),
    nonceStrategy: z.enum(['pending', 'latest', 'increment']).optional()
  })
  .refine((value) => value.txRequest || value.rawTx || value.foundry, {
    message: 'txRequest, rawTx, or foundry reference required'
  });

export async function registerDeploymentRoutes(app: FastifyInstance) {
  app.get('/v1/deployments', async (req) => {
    const queryParams = req.query as { limit?: string; chainKey?: string };
    const limit = Number(queryParams.limit || 50);
    const chainKey = queryParams.chainKey;
    const values: Array<string | number> = [limit];
    const where = chainKey ? 'WHERE chain_key = $2' : '';
    if (chainKey) values.push(chainKey);
    const rows = await query<{
      id: string;
      chain_key: string;
      name: string | null;
      mode: string | null;
      status: string;
      created_at: string;
      updated_at: string;
    }>(
      `SELECT id, chain_key, name, mode, status, created_at, updated_at\n       FROM gas_deployments ${where}\n       ORDER BY created_at DESC LIMIT $1`,
      values
    );
    return { deployments: rows };
  });

  app.get('/v1/deployments/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const rows = await query<{
      id: string;
      chain_key: string;
      name: string | null;
      mode: string | null;
      status: string;
      created_at: string;
      updated_at: string;
    }>(
      'SELECT id, chain_key, name, mode, status, created_at, updated_at FROM gas_deployments WHERE id = $1',
      [id]
    );
    if (!rows[0]) {
      reply.code(404);
      return { error: 'deployment_not_found' };
    }
    const decisionRows = await query<{
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
       FROM gas_autonomy_decisions WHERE deployment_id = $1 ORDER BY created_at DESC LIMIT 1`,
      [id]
    );
    const attempts = await query<{ count: string }>(
      'SELECT COUNT(*) as count FROM gas_deployment_attempts WHERE deployment_id = $1',
      [id]
    );
    const decision = decisionRows[0]
      ? {
          id: decisionRows[0].id,
          deploymentId: decisionRows[0].deployment_id,
          chainKey: decisionRows[0].chain_key,
          mode: decisionRows[0].mode,
          action: decisionRows[0].action,
          status: decisionRows[0].status,
          riskScore: Number(decisionRows[0].risk_score),
          predictedSuccess: Number(decisionRows[0].predicted_success),
          predictedGasUsed: decisionRows[0].predicted_gas_used ? Number(decisionRows[0].predicted_gas_used) : null,
          selectedGasLimit: decisionRows[0].selected_gas_limit ? Number(decisionRows[0].selected_gas_limit) : null,
          selectedMaxRetries: decisionRows[0].selected_max_retries ?? null,
          rationale: decisionRows[0].rationale || {},
          confidence: Number(decisionRows[0].confidence),
          createdAt: decisionRows[0].created_at
        }
      : null;
    return { deployment: rows[0], decision, attempts: Number(attempts[0]?.count || 0) };
  });

  app.get('/v1/deployments/:id/attempts', async (req, reply) => {
    const { id } = req.params as { id: string };
    const rows = await query<{
      id: string;
      decision_id: string | null;
      attempt: number;
      tx_hash: string | null;
      gas_limit: string | null;
      gas_price: string | null;
      max_fee_per_gas: string | null;
      max_priority_fee_per_gas: string | null;
      status: string;
      failure_reason: string | null;
      classification: string | null;
      gas_used: string | null;
      created_at: string;
    }>(
      `SELECT id, decision_id, attempt, tx_hash, gas_limit, gas_price, max_fee_per_gas, max_priority_fee_per_gas, status, failure_reason, classification, gas_used, created_at
       FROM gas_deployment_attempts WHERE deployment_id = $1 ORDER BY attempt ASC`,
      [id]
    );
    if (!rows.length) {
      const exists = await query<{ id: string }>('SELECT id FROM gas_deployments WHERE id = $1', [id]);
      if (!exists[0]) {
        reply.code(404);
        return { error: 'deployment_not_found' };
      }
    }
    return { attempts: rows };
  });

  const enqueueDeployment = async (payload: z.infer<typeof createSchema>) => {
    const rows = await query<{ id: string }>(
      `INSERT INTO gas_deployments (chain_key, name, mode, status, tx_request, raw_tx, foundry_path, foundry_index)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
       RETURNING id`,
      [
        payload.chainKey,
        payload.name || null,
        payload.mode || null,
        'queued',
        payload.txRequest || null,
        payload.rawTx || null,
        payload.foundry?.path || null,
        payload.foundry?.txIndex ?? null
      ]
    );
    const deploymentId = rows[0].id;
    await deploymentQueue.add('deploy', {
      deploymentId,
      chainKey: payload.chainKey,
      name: payload.name,
      mode: payload.mode,
      txRequest: payload.txRequest,
      rawTx: payload.rawTx,
      foundry: payload.foundry,
      nonceStrategy: payload.nonceStrategy
    });
    return deploymentId;
  };

  app.post('/v1/deployments', async (req, reply) => {
    const parsed = createSchema.safeParse(req.body);
    if (!parsed.success) {
      reply.code(400);
      return { error: 'invalid_request', details: parsed.error.flatten() };
    }
    const deploymentId = await enqueueDeployment(parsed.data);
    return { deploymentId, status: 'queued' };
  });

  app.post('/v1/deployments/:id/retry', async (req, reply) => {
    const { id } = req.params as { id: string };
    const rows = await query<{
      id: string;
      chain_key: string;
      name: string | null;
      mode: string | null;
      tx_request: Record<string, unknown> | null;
      raw_tx: string | null;
      foundry_path: string | null;
      foundry_index: number | null;
    }>(
      'SELECT id, chain_key, name, mode, tx_request, raw_tx, foundry_path, foundry_index FROM gas_deployments WHERE id = $1',
      [id]
    );
    if (!rows[0]) {
      reply.code(404);
      return { error: 'deployment_not_found' };
    }
    await deploymentQueue.add('deploy', {
      deploymentId: id,
      chainKey: rows[0].chain_key,
      name: rows[0].name || undefined,
      mode: rows[0].mode || undefined,
      txRequest: rows[0].tx_request || undefined,
      rawTx: rows[0].raw_tx || undefined,
      foundry: rows[0].foundry_path
        ? { path: rows[0].foundry_path, txIndex: rows[0].foundry_index ?? undefined }
        : undefined
    });
    await query('UPDATE gas_deployments SET status = $1, updated_at = now() WHERE id = $2', ['queued', id]);
    return { deploymentId: id, status: 'queued' };
  });

  app.post('/v1/tx/submitWithRetry', async (req, reply) => {
    const parsed = createSchema.safeParse(req.body);
    if (!parsed.success) {
      reply.code(400);
      return { error: 'invalid_request', details: parsed.error.flatten() };
    }
    const deploymentId = await enqueueDeployment(parsed.data);
    return { deploymentId, status: 'queued' };
  });
}
