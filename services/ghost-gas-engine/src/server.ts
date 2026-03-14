import Fastify from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import { config } from './config.js';
import { registerHealthRoutes } from './routes/health.js';
import { registerChainRoutes } from './routes/chains.js';
import { registerPolicyRoutes } from './routes/policies.js';
import { registerSimulationRoutes } from './routes/simulate.js';
import { registerDeploymentRoutes } from './routes/deployments.js';
import { registerMetricsRoutes } from './routes/metrics.js';
import { registerAutonomyRoutes } from './routes/autonomy.js';
import { registerAiCoreRoutes } from './routes/ai-core.js';
import { registerGasRoutes } from './routes/gas.js';

const app = Fastify({
  logger: {
    level: config.LOG_LEVEL
  }
});

app.addHook('onRequest', async (req) => {
  const traceparent = req.headers['traceparent'];
  if (traceparent) {
    req.log = req.log.child({ traceparent });
  }
});

app.register(cors, {
  origin: (origin, cb) => {
    if (!origin) return cb(null, true);
    if (config.NODE_ENV !== 'production') return cb(null, true);
    cb(null, false);
  }
});
app.register(helmet);
app.register(rateLimit, { max: 200, timeWindow: '1 minute' });

app.setErrorHandler((error, _req, reply) => {
  const status = (error as Error & { statusCode?: number }).statusCode || 500;
  const message = error instanceof Error && error.message ? error.message : 'request_failed';
  reply.code(status).send({ error: message });
});

await registerHealthRoutes(app);
await registerChainRoutes(app);
await registerPolicyRoutes(app);
await registerSimulationRoutes(app);
await registerDeploymentRoutes(app);
await registerMetricsRoutes(app);
await registerAutonomyRoutes(app);
await registerAiCoreRoutes(app);
await registerGasRoutes(app);

app.listen({ port: config.PORT, host: '0.0.0.0' }).catch((err) => {
  app.log.error(err);
  process.exit(1);
});
