import type { FastifyInstance } from 'fastify';
import { query } from '../db/index.js';

export const registerChainRoutes = (app: FastifyInstance) => {
  app.get('/v1/chains', async () => {
    const rows = await query<{
      chain_id: string;
      chain_key: string;
      name: string;
      type: string;
      gas_token_symbol: string;
      rpc_url_ref: string;
      last_block_number: string | null;
      last_block_hash: string | null;
      last_ingested_at: string | null;
    }>(
      `SELECT c.chain_id, c.chain_key, c.name, c.type, c.gas_token_symbol, c.rpc_url_ref,
              s.last_block_number, s.last_block_hash, s.last_ingested_at
       FROM pil_chains c
       LEFT JOIN pil_chain_state s ON c.chain_id = s.chain_id
       ORDER BY c.chain_id`
    );
    return {
      chains: rows.map((row) => ({
        chainId: row.chain_id,
        chainKey: row.chain_key,
        name: row.name,
        type: row.type,
        gasTokenSymbol: row.gas_token_symbol,
        rpcUrlRef: row.rpc_url_ref,
        lastBlockNumber: row.last_block_number,
        lastBlockHash: row.last_block_hash,
        lastIngestedAt: row.last_ingested_at
      }))
    };
  });
};
