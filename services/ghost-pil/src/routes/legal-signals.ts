import type { FastifyInstance } from 'fastify';
import { query } from '../db/index.js';

export const registerLegalSignalRoutes = (app: FastifyInstance) => {
  app.get('/v1/legal-signals', async (req) => {
    const { jurisdiction, limit } = req.query as { jurisdiction?: string; limit?: string };
    const params: unknown[] = [];
    let where = '';
    if (jurisdiction) {
      params.push(jurisdiction);
      where = `WHERE jurisdiction_code = $${params.length}`;
    }
    const limitValue = limit ? Math.min(Number(limit), 100) : 50;
    params.push(limitValue);

    const rows = await query<{
      id: string;
      jurisdiction_code: string;
      category: string;
      severity: string;
      confidence: number;
      detected_at: string;
      summary: string;
      source_refs: unknown;
    }>(
      `SELECT id, jurisdiction_code, category, severity, confidence, detected_at, summary, source_refs
       FROM pil_legal_signals
       ${where}
       ORDER BY detected_at DESC
       LIMIT $${params.length}`,
      params
    );

    return {
      signals: rows.map((row) => ({
        id: row.id,
        jurisdictionCode: row.jurisdiction_code,
        category: row.category,
        severity: row.severity,
        confidence: row.confidence,
        detectedAt: row.detected_at,
        summary: row.summary,
        sourceRefs: row.source_refs
      }))
    };
  });
};
