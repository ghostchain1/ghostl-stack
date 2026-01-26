import type { FastifyInstance } from 'fastify';
import { query } from '../db/index.js';

export const registerRecommendationRoutes = (app: FastifyInstance) => {
  app.get('/v1/recommendations', async () => {
    const rows = await query<{
      id: string;
      chain_id: string;
      recommendation_type: string;
      summary: string;
      rationale: string;
      risks: string[];
      confidence: string;
      sim_run_ids: string[];
      rollback_plan: string | null;
      required_approvals: number;
      status: string;
      created_at: string;
    }>('SELECT id, chain_id, recommendation_type, summary, rationale, risks, confidence, sim_run_ids, rollback_plan, required_approvals, status, created_at FROM pil_recommendations ORDER BY created_at DESC');

    return { recommendations: rows };
  });

  app.get('/v1/recommendations/:id', async (req) => {
    const { id } = req.params as { id: string };
    const rows = await query<{
      id: string;
      chain_id: string;
      recommendation_type: string;
      summary: string;
      rationale: string;
      risks: string[];
      confidence: string;
      sim_run_ids: string[];
      rollback_plan: string | null;
      required_approvals: number;
      status: string;
      created_at: string;
    }>('SELECT id, chain_id, recommendation_type, summary, rationale, risks, confidence, sim_run_ids, rollback_plan, required_approvals, status, created_at FROM pil_recommendations WHERE id = $1', [id]);

    return { recommendation: rows[0] || null };
  });
};
