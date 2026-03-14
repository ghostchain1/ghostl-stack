import { access } from 'fs/promises';
import type { FastifyInstance } from 'fastify';
import { pool } from '../db/index.js';
import { loadChains, loadPolicies } from '../config.js';

export async function registerHealthRoutes(app: FastifyInstance) {
  const readinessFile = process.env.READINESS_FILE ?? '/tmp/ghost_gas_engine_migrated';

  const checkDb = async () => {
    try {
      await pool.query('SELECT 1');
      return true;
    } catch {
      return false;
    }
  };

  const checkConfig = () => {
    try {
      loadChains();
      loadPolicies();
      return true;
    } catch {
      return false;
    }
  };

  app.get('/health', async () => ({
    ok: true,
    service: 'ghost-chain-ai-core',
    module: 'ChainAICore/GhostGasEngine',
    time: new Date().toISOString()
  }));

  app.get('/ready', async (_req, reply) => {
    const migrated =
      readinessFile.length === 0 ? true : await access(readinessFile).then(() => true).catch(() => false);
    const dbOk = await checkDb();
    const configOk = checkConfig();
    const ok = migrated && dbOk && configOk;
    reply.code(ok ? 200 : 503);
    return {
      ok,
      migrated,
      dbOk,
      configOk,
      module: 'ChainAICore/GhostGasEngine'
    };
  });
}
