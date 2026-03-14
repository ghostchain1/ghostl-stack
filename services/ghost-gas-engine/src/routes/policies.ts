import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { config, loadPolicies } from '../config.js';
import { query } from '../db/index.js';

const policySchema = z.object({
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

const requireAdmin = (req: FastifyRequest) => {
  if (!config.ADMIN_TOKEN) return;
  const header = req.headers['x-admin-token'];
  const token = Array.isArray(header) ? header[0] : header;
  if (!token || token !== config.ADMIN_TOKEN) {
    const err = new Error('forbidden');
    (err as Error & { statusCode?: number }).statusCode = 403;
    throw err;
  }
};

export async function registerPolicyRoutes(app: FastifyInstance) {
  app.get('/v1/policies', async () => {
    const rows = await query<{ policy: unknown }>(
      'SELECT policy FROM gas_policies WHERE active = true ORDER BY chain_key, created_at DESC'
    );
    return { policies: rows.map((row) => row.policy) };
  });

  app.put('/v1/policies/:chainId', async (req, reply) => {
    requireAdmin(req);
    const body = policySchema.safeParse(req.body);
    if (!body.success) {
      reply.code(400);
      return { error: 'invalid_policy', details: body.error.flatten() };
    }

    await query('UPDATE gas_policies SET active = false WHERE chain_key = $1 AND version <> $2', [
      body.data.chainKey,
      body.data.version
    ]);
    await query(
      `INSERT INTO gas_policies (chain_key, version, policy, active)
       VALUES ($1,$2,$3,true)
       ON CONFLICT (chain_key, version) DO UPDATE SET policy = EXCLUDED.policy, active = true`,
      [body.data.chainKey, body.data.version, body.data]
    );
    return { ok: true, policy: body.data };
  });

  app.get('/v1/policies/defaults', async () => {
    return { policies: loadPolicies() };
  });
}
