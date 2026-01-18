import express from 'express';
import crypto from 'crypto';
import { HealthChecker } from './health/checker.js';

const PORT = Number(process.env.PORT || 8088);

const checker = new HealthChecker({
  intervalMs: Number(process.env.HEALTH_INTERVAL_MS || 60_000),
  timeoutMs: Number(process.env.HEALTH_TIMEOUT_MS || 1500),
  degradedMs: Number(process.env.HEALTH_DEGRADED_MS || 1200)
});

checker.start();

const app = express();

app.get('/v1/endpoints', (_req, res) => {
  const payload = checker.getRegistrySnapshot();
  const body = JSON.stringify(payload);
  const etag = crypto.createHash('sha256').update(body).digest('hex');
  res.setHeader('content-type', 'application/json');
  res.setHeader('etag', `"${etag}"`);
  res.setHeader('cache-control', 'public, max-age=60, s-maxage=300, stale-while-revalidate=600');
  const ifNoneMatch = _req.headers['if-none-match'];
  if (ifNoneMatch && ifNoneMatch.replace(/W\//, '') === `"${etag}"`) {
    res.status(304).end();
    return;
  }
  res.status(200).send(body);
});

app.get('/health', (_req, res) => res.json({ ok: true }));

app.listen(PORT, '0.0.0.0', () => {
  console.log(`rpc-registry-service listening on :${PORT}`);
});
