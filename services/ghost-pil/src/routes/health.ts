import type { FastifyInstance } from 'fastify';
import { config } from '../config.js';

export const registerHealthRoutes = (app: FastifyInstance) => {
  app.get('/health', async () => ({
    status: 'ok',
    pilEnabled: config.PIL_ENABLED,
    autonomyMode: config.PIL_AUTONOMY_MODE,
    writeEnabled: config.PIL_WRITE_ENABLED,
    approvalRequired: config.PIL_APPROVAL_REQUIRED,
    ingestEnabled: config.PIL_INGEST_ENABLED
  }));
};
