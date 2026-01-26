import type { FastifyInstance } from 'fastify';
import { query } from '../db/index.js';

export const registerValidatorScoreRoutes = (app: FastifyInstance) => {
  app.get('/v1/validators/scores', async () => {
    const rows = await query<{
      validator_id: string;
      chain_id: string;
      jurisdiction_code: string;
      score: number;
      reason: string | null;
      updated_at: string;
    }>(
      `SELECT validator_id, chain_id, jurisdiction_code, score, reason, updated_at
       FROM pil_validator_scores
       ORDER BY score DESC`
    );

    return {
      validators: rows.map((row) => ({
        validatorId: row.validator_id,
        chainId: row.chain_id,
        jurisdictionCode: row.jurisdiction_code,
        score: row.score,
        reason: row.reason,
        updatedAt: row.updated_at
      }))
    };
  });
};
