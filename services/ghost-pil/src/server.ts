import Fastify from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import { config } from './config.js';
import { metricsHandler } from './telemetry/metrics.js';
import { registerHealthRoutes } from './routes/health.js';
import { registerChainRoutes } from './routes/chains.js';
import { registerIngestRoutes } from './routes/ingest.js';
import { registerJurisdictionRoutes } from './routes/jurisdictions.js';
import { registerLegalSignalRoutes } from './routes/legal-signals.js';
import { registerSimulationRoutes } from './routes/simulations.js';
import { registerRecommendationRoutes } from './routes/recommendations.js';
import { registerMetricsSummaryRoutes } from './routes/metrics-summary.js';
import { registerDecisionRoutes } from './routes/decisions.js';
import { registerPolicyPackRoutes } from './routes/policy-packs.js';
import { registerAttestationRoutes } from './routes/attestations.js';
import { registerValidatorScoreRoutes } from './routes/validator-scores.js';
import { registerPreflightRoutes } from './routes/preflight.js';
import { closeDb } from './db/index.js';

const app = Fastify({
  logger: {
    level: config.PIL_LOG_LEVEL
  }
});

app.register(cors, { origin: true, credentials: true });
app.register(helmet);
app.register(rateLimit, { max: 300, timeWindow: '1 minute' });

app.setErrorHandler((err, _req, reply) => {
  const status = (err as { statusCode?: number }).statusCode || 500;
  const message = err instanceof Error ? err.message : 'internal_error';
  reply.status(status).send({ error: message || 'internal_error' });
});

app.get('/metrics', async (_req, reply) => {
  const metrics = await metricsHandler();
  reply.header('Content-Type', 'text/plain; version=0.0.4');
  return reply.send(metrics);
});

registerHealthRoutes(app);
registerChainRoutes(app);
registerIngestRoutes(app);
registerJurisdictionRoutes(app);
registerLegalSignalRoutes(app);
registerSimulationRoutes(app);
registerRecommendationRoutes(app);
registerMetricsSummaryRoutes(app);
registerDecisionRoutes(app);
registerPolicyPackRoutes(app);
registerAttestationRoutes(app);
registerValidatorScoreRoutes(app);
registerPreflightRoutes(app);

const start = async () => {
  await app.listen({ host: '0.0.0.0', port: config.PORT });
};

const shutdown = async () => {
  await app.close();
  await closeDb();
};

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

start().catch((err) => {
  app.log.error(err, 'ghost-pil failed to start');
  process.exit(1);
});
