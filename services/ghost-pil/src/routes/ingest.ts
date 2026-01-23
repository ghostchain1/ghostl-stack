import type { FastifyInstance } from 'fastify';
import { config } from '../config';
import { query } from '../db';

export const registerIngestRoutes = (app: FastifyInstance) => {
  app.get('/v1/ingest/status', async () => {
    const rows = await query<{
      chain_id: string;
      chain_key: string;
      name: string;
      last_block_number: string | null;
      last_block_hash: string | null;
      last_ingested_at: string | null;
      last_error: string | null;
    }>(
      `SELECT c.chain_id, c.chain_key, c.name, s.last_block_number, s.last_block_hash, s.last_ingested_at, s.last_error
       FROM pil_chains c
       LEFT JOIN pil_chain_state s ON c.chain_id = s.chain_id
       ORDER BY c.chain_id`
    );

    return {
      ingestEnabled: config.PIL_INGEST_ENABLED,
      intervalSeconds: config.PIL_INGEST_INTERVAL_SECONDS,
      maxBlocksPerTick: config.PIL_MAX_BLOCKS_PER_TICK,
      chains: rows.map((row) => ({
        chainId: row.chain_id,
        chainKey: row.chain_key,
        name: row.name,
        lastBlockNumber: row.last_block_number,
        lastBlockHash: row.last_block_hash,
        lastIngestedAt: row.last_ingested_at,
        lastError: row.last_error
      }))
    };
  });
};
