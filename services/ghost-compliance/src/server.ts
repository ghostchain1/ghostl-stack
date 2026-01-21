import Fastify from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import jwt from '@fastify/jwt';
import { config } from './config';
import { registerDecisionRoutes } from './routes/decision';
import { registerPolicyRoutes } from './routes/policies';
import { registerLawRoutes } from './routes/laws';
import { registerAuditRoutes } from './routes/audit';
import { metricsHandler } from './telemetry/metrics';
import { startOtel, stopOtel } from './telemetry/otel';
import { closeDb } from './db';

const app = Fastify({
  logger: {
    level: config.logLevel
  }
});

const roleOrder = { viewer: 0, analyst: 1, admin: 2 } as const;

const buildRoleGuard = (role: keyof typeof roleOrder) => async (req: typeof app['request']): Promise<void> => {
  const user = (req as typeof req & { user?: { role?: string } }).user;
  if (!user?.role) {
    const err = new Error('unauthorized') as Error & { statusCode?: number };
    err.statusCode = 401;
    throw err;
  }
  const userRank = roleOrder[user.role as keyof typeof roleOrder];
  if (userRank === undefined || userRank < roleOrder[role]) {
    const err = new Error('forbidden') as Error & { statusCode?: number };
    err.statusCode = 403;
    throw err;
  }
};

const requireAdmin = buildRoleGuard('admin');
const requireAnalyst = buildRoleGuard('analyst');

app.register(cors, { origin: config.corsOrigin, credentials: true });
app.register(helmet);
app.register(rateLimit, { max: 200, timeWindow: '1 minute' });
app.register(jwt, { secret: config.jwtSecret });

app.addHook('onRequest', async (req) => {
  const traceparent = req.headers.traceparent;
  const requestId = req.headers['x-request-id'] || req.id;
  req.log = req.log.child({ traceparent, requestId });
  if (req.headers.authorization) {
    try {
      const user = await req.jwtVerify<{ sub: string; role: string }>();
      (req as typeof req & { user?: { sub: string; role: string } }).user = user;
    } catch {
      // auth is enforced on protected routes only
    }
  }
});

app.setErrorHandler((err, _req, reply) => {
  const status = (err as { statusCode?: number }).statusCode || 500;
  reply.status(status).send({ error: err.message || 'internal_error' });
});

app.get('/health', async () => ({ status: 'ok' }));
app.get('/metrics', async (_req, reply) => {
  const metrics = await metricsHandler();
  reply.header('Content-Type', 'text/plain; version=0.0.4');
  return reply.send(metrics);
});

registerDecisionRoutes(app);
registerPolicyRoutes(app, { requireAdmin, requireAnalyst });
registerLawRoutes(app, { requireAdmin });
registerAuditRoutes(app, { requireAnalyst });

const start = async () => {
  await startOtel();
  await app.listen({ host: '0.0.0.0', port: config.port });
};

const shutdown = async () => {
  await app.close();
  await closeDb();
  await stopOtel();
};

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

start().catch((err) => {
  app.log.error(err, 'ghost-compliance failed to start');
  process.exit(1);
});
