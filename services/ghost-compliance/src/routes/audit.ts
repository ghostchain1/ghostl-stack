import type { FastifyInstance, FastifyRequest } from 'fastify';
import { query } from '../db';

export async function registerAuditRoutes(
  app: FastifyInstance,
  deps: { requireAnalyst: (req: FastifyRequest) => Promise<void> }
) {
  app.get('/v1/audit/decisions', async (req, reply) => {
    await deps.requireAnalyst(req);
    const { walletAddress, action, decision, limit } = req.query as {
      walletAddress?: string;
      action?: string;
      decision?: string;
      limit?: string;
    };
    const filters: string[] = [];
    const values: unknown[] = [];
    if (walletAddress) {
      values.push(walletAddress);
      filters.push(`s.wallet_address = $${values.length}`);
    }
    if (action) {
      values.push(action);
      filters.push(`d.action = $${values.length}`);
    }
    if (decision) {
      values.push(decision);
      filters.push(`d.decision = $${values.length}`);
    }
    const where = filters.length ? `WHERE ${filters.join(' AND ')}` : '';
    const cap = Math.min(Number(limit) || 50, 200);

    const rows = await query(
      `SELECT d.id, d.request_id, d.action, d.decision, d.reasons, d.required_controls, d.disclosures, d.matched_rules, d.policy_bundle_id,
              d.evidence_bundle_id, d.created_at,
              s.wallet_address, s.chain_id, s.user_id, s.residency_country, s.kyc_level
       FROM compliance_decisions d
       JOIN compliance_subjects s ON s.id = d.subject_id
       ${where}
       ORDER BY d.created_at DESC
       LIMIT ${cap}`,
      values
    );
    return reply.send({ decisions: rows });
  });

  app.get('/v1/audit/evidence/:bundleId', async (req, reply) => {
    await deps.requireAnalyst(req);
    const id = (req.params as { bundleId: string }).bundleId;
    const rows = await query(
      'SELECT id, subject_id, decision_id, prev_hash, hash, artifacts, created_at FROM evidence_bundles WHERE id = $1',
      [id]
    );
    if (!rows.length) {
      return reply.status(404).send({ error: 'evidence_bundle_missing' });
    }
    return reply.send({ evidence: rows[0] });
  });
}
