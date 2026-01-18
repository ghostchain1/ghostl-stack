import express from 'express';
import { HealthChecker } from './health/checker';
import { buildEndpointsHandler } from './api/endpoints';

const PORT = Number(process.env.PORT || 8088);
const REGISTRY_PATH = process.env.REGISTRY_PATH;

const checker = new HealthChecker({
  registryPath: REGISTRY_PATH,
  intervalMs: Number(process.env.HEALTH_INTERVAL_MS || 60_000),
  timeoutMs: Number(process.env.HEALTH_TIMEOUT_MS || 1500),
  degradedMs: Number(process.env.HEALTH_DEGRADED_MS || 1200)
});

checker.start();

const app = express();
app.get('/v1/endpoints', buildEndpointsHandler(checker));
app.get('/health', (_req, res) => res.json({ ok: true }));

app.listen(PORT, '0.0.0.0', () => {
  // eslint-disable-next-line no-console
  console.log(`rpc-registry-service listening on :${PORT}`);
});
