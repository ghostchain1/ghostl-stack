import Fastify from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import { config } from './config';
import { metricsHandler } from './telemetry/metrics';
import { registerHealthRoutes } from './routes/health';
import { registerChainRoutes } from './routes/chains';
import { registerIngestRoutes } from './routes/ingest';
import { registerJurisdictionRoutes } from './routes/jurisdictions';
import { registerLegalSignalRoutes } from './routes/legal-signals';
import { registerSimulationRoutes } from './routes/simulations';
import { registerRecommendationRoutes } from './routes/recommendations';
import { registerMetricsSummaryRoutes } from './routes/metrics-summary';
import { registerDecisionRoutes } from './routes/decisions';
import { registerPolicyPackRoutes } from './routes/policy-packs';
import { registerAttestationRoutes } from './routes/attestations';
import { registerValidatorScoreRoutes } from './routes/validator-scores';
import { registerPreflightRoutes } from './routes/preflight';
import { closeDb } from './db';

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
  reply.status(status).send({ error: err.message || 'internal_error' });
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
