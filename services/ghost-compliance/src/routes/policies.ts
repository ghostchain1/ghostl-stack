import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { parsePolicyBundle } from '../engine/parser';
import { evaluatePolicy } from '../engine/evaluator';
import { query, redis } from '../db';

const policyUploadSchema = z.object({
  bundleYaml: z.string().min(1)
});

const simulateSchema = z.object({
  bundleYaml: z.string().min(1),
  input: z.object({
    requestId: z.string().min(1),
    subject: z.object({
      type: z.string().min(1),
      walletAddress: z.string().min(1),
      chainId: z.string().min(1),
      userId: z.string().optional(),
      residencyCountry: z.string().optional(),
      kycLevel: z.string().optional()
    }),
    action: z.string().min(1),
    resource: z.record(z.unknown()).optional(),
    context: z.record(z.unknown()).optional()
  })
});

export async function registerPolicyRoutes(
  app: FastifyInstance,
  deps: { requireAdmin: (req: FastifyRequest) => Promise<void>; requireAnalyst: (req: FastifyRequest) => Promise<void> }
) {
  app.get('/v1/policies', async (_req, reply) => {
    const rows = await query<{ id: string; bundle_id: string; version: string; status: string; created_at: string; activated_at: string | null }>(
      'SELECT id, bundle_id, version, status, created_at, activated_at FROM policy_bundles ORDER BY created_at DESC'
    );
    return reply.send({ bundles: rows });
  });

  app.get('/v1/policies/active', async (_req, reply) => {
    const rows = await query<{ id: string; yaml: string }>(
      'SELECT id, yaml FROM policy_bundles WHERE status = $1 ORDER BY activated_at DESC NULLS LAST, created_at DESC LIMIT 1',
      ['active']
    );
    if (!rows.length) {
      return reply.status(404).send({ error: 'active_bundle_missing' });
    }
    return reply.send({ bundle: parsePolicyBundle(rows[0].yaml) });
  });

  app.post('/v1/policies', async (req, reply) => {
    await deps.requireAdmin(req);
    const parsed = policyUploadSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'invalid_bundle', details: parsed.error.flatten() });
    }
    const bundle = parsePolicyBundle(parsed.data.bundleYaml);
    const created = await query<{ id: string }>(
      `INSERT INTO policy_bundles (bundle_id, version, status, yaml, bundle, signature)
       VALUES ($1,$2,'draft',$3,$4,$5) RETURNING id`,
      [bundle.metadata.bundleId, bundle.metadata.version, parsed.data.bundleYaml, bundle, null]
    );

    await query('DELETE FROM policy_rules WHERE bundle_id = $1', [created[0].id]);
    for (const rule of bundle.policies) {
      const effect = 'deny' in rule.effect ? 'deny' : 'require' in rule.effect ? 'require' : 'allow';
      await query(
        `INSERT INTO policy_rules (bundle_id, rule_id, priority, actions, effect, effect_detail)
         VALUES ($1,$2,$3,$4,$5,$6)`,
        [created[0].id, rule.id, rule.priority, rule.appliesTo.actions, effect, rule.effect]
      );
    }
    await redis.del('compliance:policy:active');

    return reply.status(201).send({ id: created[0].id, bundleId: bundle.metadata.bundleId, version: bundle.metadata.version });
  });

  app.post('/v1/policies/:id/stage', async (req, reply) => {
    await deps.requireAdmin(req);
    const id = (req.params as { id: string }).id;
    await query('UPDATE policy_bundles SET status = $1, staged_at = now() WHERE id = $2', ['staged', id]);
    await redis.del('compliance:policy:active');
    return reply.send({ ok: true });
  });

  app.post('/v1/policies/:id/activate', async (req, reply) => {
    await deps.requireAdmin(req);
    const id = (req.params as { id: string }).id;
    await query('UPDATE policy_bundles SET status = $1 WHERE status = $2', ['draft', 'active']);
    await query('UPDATE policy_bundles SET status = $1, activated_at = now() WHERE id = $2', ['active', id]);
    await redis.del('compliance:policy:active');
    return reply.send({ ok: true });
  });

  app.post('/v1/policies/simulate', async (req, reply) => {
    await deps.requireAnalyst(req);
    const parsed = simulateSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'invalid_request', details: parsed.error.flatten() });
    }
    const bundle = parsePolicyBundle(parsed.data.bundleYaml);
    const input = {
      ...parsed.data.input,
      resource: parsed.data.input.resource || {},
      context: parsed.data.input.context || {}
    };
    const decision = evaluatePolicy(bundle, input);
    return reply.send({ decision });
  });
}
