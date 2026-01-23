import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { config } from '../config';
import { query, withTransaction } from '../db';
import { runSimulation } from '../sim/engine';

const simulationRequestSchema = z.object({
  chainId: z.number().int(),
  horizon: z.string().default('1h'),
  params: z.object({
    gasLimitDelta: z.number().optional(),
    feeDelta: z.number().optional(),
    note: z.string().optional()
  }).default({})
});

export const registerSimulationRoutes = (app: FastifyInstance) => {
  app.post('/v1/simulations', async (req, reply) => {
    if (!config.PIL_SIM_ENABLED) {
      reply.status(403);
      return { error: 'PIL_SIM_DISABLED', hint: 'Set PIL_SIM_ENABLED=true to run simulations.' };
    }

    const parsed = simulationRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      reply.status(400);
      return { error: 'invalid_request', details: parsed.error.flatten() };
    }

    const chainRow = await query<{ chain_id: string }>(
      'SELECT chain_id FROM pil_chains WHERE chain_id = $1 LIMIT 1',
      [parsed.data.chainId]
    );
    if (!chainRow[0]) {
      reply.status(404);
      return { error: 'chain_not_found' };
    }

    const simulationResult = await runSimulation({
      chainId: parsed.data.chainId,
      horizon: parsed.data.horizon,
      params: parsed.data.params
    });

    const created = await withTransaction(async (client) => {
      const runRow = await client.query<{
        id: string;
        created_at: string;
      }>(
        `INSERT INTO pil_sim_runs (chain_id, horizon, params_json, model_version, status)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING id, created_at`,
        [
          parsed.data.chainId,
          parsed.data.horizon,
          JSON.stringify(parsed.data.params),
          'baseline-v1',
          'completed'
        ]
      );

      await client.query(
        `INSERT INTO pil_sim_results
         (run_id, throughput, predicted_fees, predicted_revert_rate, predicted_oog_rate, confidence, results_json)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [
          runRow.rows[0].id,
          simulationResult.throughput,
          simulationResult.predictedFees,
          simulationResult.predictedRevertRate,
          simulationResult.predictedOogRate,
          simulationResult.confidence,
          simulationResult.resultsJson
        ]
      );

      return runRow.rows[0];
    });

    return {
      simulation: {
        id: created.id,
        chain_id: String(parsed.data.chainId),
        horizon: parsed.data.horizon,
        status: 'completed',
        created_at: created.created_at
      },
      result: simulationResult
    };
  });

  app.get('/v1/simulations', async () => {
    const rows = await query<{
      id: string;
      chain_id: string;
      horizon: string;
      params_json: unknown;
      model_version: string;
      status: string;
      created_at: string;
    }>('SELECT id, chain_id, horizon, params_json, model_version, status, created_at FROM pil_sim_runs ORDER BY created_at DESC');

    return { simulations: rows };
  });

  app.get('/v1/simulations/:id', async (req) => {
    const { id } = req.params as { id: string };
    const rows = await query<{
      id: string;
      chain_id: string;
      horizon: string;
      params_json: unknown;
      model_version: string;
      status: string;
      created_at: string;
    }>('SELECT id, chain_id, horizon, params_json, model_version, status, created_at FROM pil_sim_runs WHERE id = $1', [id]);

    if (!rows[0]) {
      return { simulation: null };
    }
    return { simulation: rows[0] };
  });

  app.get('/v1/simulations/:id/results', async (req) => {
    const { id } = req.params as { id: string };
    const rows = await query<{
      id: string;
      run_id: string;
      throughput: string | null;
      predicted_fees: string | null;
      predicted_revert_rate: string | null;
      predicted_oog_rate: string | null;
      confidence: string | null;
      results_json: unknown;
      created_at: string;
    }>('SELECT id, run_id, throughput, predicted_fees, predicted_revert_rate, predicted_oog_rate, confidence, results_json, created_at FROM pil_sim_results WHERE run_id = $1 ORDER BY created_at DESC', [id]);

    return { results: rows };
  });
};
