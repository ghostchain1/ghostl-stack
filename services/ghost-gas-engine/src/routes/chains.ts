import type { FastifyInstance } from 'fastify';
import { loadChains } from '../config.js';

export async function registerChainRoutes(app: FastifyInstance) {
  app.get('/v1/chains', async () => {
    const chains = loadChains();
    return { chains };
  });
}
