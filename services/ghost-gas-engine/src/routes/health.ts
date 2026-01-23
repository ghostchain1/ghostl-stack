import type { FastifyInstance } from 'fastify';

export async function registerHealthRoutes(app: FastifyInstance) {
  app.get('/health', async () => ({ ok: true, service: 'ghost-chain-ai-core', time: new Date().toISOString() }));
}
