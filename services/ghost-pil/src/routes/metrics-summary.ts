import type { FastifyInstance } from 'fastify';
import { query } from '../db';

export const registerMetricsSummaryRoutes = (app: FastifyInstance) => {
  app.get('/v1/metrics/summary', async () => {
    const blocks = await query<{ count: string }>('SELECT COUNT(*)::text AS count FROM pil_blocks');
    const txs = await query<{ count: string }>('SELECT COUNT(*)::text AS count FROM pil_txs');
    const receipts = await query<{ count: string }>('SELECT COUNT(*)::text AS count FROM pil_receipts');
    const traces = await query<{ count: string }>('SELECT COUNT(*)::text AS count FROM pil_traces');
    const decisions = await query<{ count: string }>('SELECT COUNT(*)::text AS count FROM pil_compliance_decisions');
    const attestations = await query<{ count: string }>('SELECT COUNT(*)::text AS count FROM pil_compliance_proofs');

    return {
      totals: {
        blocks: blocks[0]?.count || '0',
        txs: txs[0]?.count || '0',
        receipts: receipts[0]?.count || '0',
        traces: traces[0]?.count || '0',
        complianceDecisions: decisions[0]?.count || '0',
        attestations: attestations[0]?.count || '0'
      }
    };
  });
};
