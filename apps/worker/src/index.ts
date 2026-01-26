import { createServer } from 'node:http';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { Worker as BullWorker, type Job as BullJob } from 'bullmq';
import { Redis } from 'ioredis';

// Placeholder job runner for alerts/indexers. Replace with BullMQ or a scheduler when wiring live jobs.
const heartbeatIntervalMs = Number(process.env.WORKER_HEARTBEAT_INTERVAL_MS || 30000);
if (!Number.isFinite(heartbeatIntervalMs) || heartbeatIntervalMs < 1000) {
  throw new Error('WORKER_HEARTBEAT_INTERVAL_MS must be >= 1000');
}

const healthcheckIntervalMs = Number(process.env.WORKER_HEALTHCHECK_INTERVAL_MS || 30000);
const healthcheckTimeoutMs = Number(process.env.WORKER_HEALTHCHECK_TIMEOUT_MS || 5000);
if (!Number.isFinite(healthcheckTimeoutMs) || healthcheckTimeoutMs < 1000) {
  throw new Error('WORKER_HEALTHCHECK_TIMEOUT_MS must be >= 1000');
}

const healthcheckUrls = (process.env.WORKER_HEALTHCHECK_URLS || '')
  .split(',')
  .map((value) => value.trim())
  .filter(Boolean);

const complianceHealthUrls = (process.env.WORKER_COMPLIANCE_HEALTH_URLS || process.env.WORKER_HEALTHCHECK_URLS || '')
  .split(',')
  .map((value) => value.trim())
  .filter(Boolean);
const complianceCachePath =
  process.env.WORKER_COMPLIANCE_CACHE_PATH ||
  path.join(process.cwd(), 'apps', 'worker', 'data', 'compliance-cache.json');
const complianceTimeoutMs = Number(process.env.WORKER_COMPLIANCE_TIMEOUT_MS || healthcheckTimeoutMs);
if (!Number.isFinite(complianceTimeoutMs) || complianceTimeoutMs < 1000) {
  throw new Error('WORKER_COMPLIANCE_TIMEOUT_MS must be >= 1000');
}

const queueEnabled = process.env.WORKER_QUEUE_ENABLED === 'true';
const queueName = process.env.WORKER_QUEUE_NAME;
const queueRedisUrl = process.env.WORKER_REDIS_URL || process.env.REDIS_URL;
const queueConcurrency = Number(process.env.WORKER_QUEUE_CONCURRENCY || 2);
if (queueEnabled && (!Number.isFinite(queueConcurrency) || queueConcurrency < 1)) {
  throw new Error('WORKER_QUEUE_CONCURRENCY must be >= 1');
}
const queueMode = (process.env.WORKER_QUEUE_MODE || 'log-only').toLowerCase();
if (queueEnabled && queueMode !== 'log-only' && queueMode !== 'strict') {
  throw new Error('WORKER_QUEUE_MODE must be log-only or strict');
}
const queueAllowedJobs = new Set(
  (process.env.WORKER_QUEUE_ALLOWED_JOBS || '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean)
);

let queueWorker: BullWorker | undefined;
let queueConnection: Redis | undefined;

type Job = {
  name: string;
  intervalMs: number;
  run: () => Promise<void>;
};

type JobState = {
  lastRunAt?: string;
  lastSuccessAt?: string;
  lastErrorAt?: string;
  lastError?: string;
  running: boolean;
};

const jobStates = new Map<string, JobState>();
const jobTimers = new Map<string, NodeJS.Timeout>();

const getJobState = (name: string): JobState => {
  const existing = jobStates.get(name);
  if (existing) return existing;
  const state: JobState = { running: false };
  jobStates.set(name, state);
  return state;
};

const runJob = async (job: Job) => {
  const state = getJobState(job.name);
  if (state.running) return;
  state.running = true;
  state.lastRunAt = new Date().toISOString();
  try {
    await job.run();
    state.lastSuccessAt = new Date().toISOString();
    state.lastError = undefined;
    state.lastErrorAt = undefined;
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    state.lastError = errorMessage;
    state.lastErrorAt = new Date().toISOString();
    console.error(`[worker] job ${job.name} failed`, err);
  } finally {
    state.running = false;
  }
};

const scheduleJob = (job: Job) => {
  runJob(job).catch((err) => console.error(`[worker] job ${job.name} error`, err));
  const timer = setInterval(() => {
    runJob(job).catch((err) => console.error(`[worker] job ${job.name} error`, err));
  }, job.intervalMs);
  jobTimers.set(job.name, timer);
};

const heartbeatJob: Job = {
  name: 'heartbeat',
  intervalMs: heartbeatIntervalMs,
  run: async () => {
    const now = new Date().toISOString();
    console.log(`[worker] heartbeat ${now}`);
  }
};

const healthcheckJob: Job | null = healthcheckUrls.length
  ? {
      name: 'healthchecks',
      intervalMs: healthcheckIntervalMs,
      run: async () => {
        for (const url of healthcheckUrls) {
          const controller = new AbortController();
          const timeout = setTimeout(() => controller.abort(), healthcheckTimeoutMs);
          const startedAt = Date.now();
          try {
            const res = await fetch(url, { signal: controller.signal });
            if (!res.ok) {
              throw new Error(`healthcheck_failed ${url} status=${res.status}`);
            }
            const durationMs = Date.now() - startedAt;
            console.log(`[worker] healthcheck ok ${url} ${durationMs}ms`);
          } finally {
            clearTimeout(timeout);
          }
        }
      }
    }
  : null;

const nowIso = () => new Date().toISOString();

type SyncComplianceCachePayload = {
  since?: string;
};

type HealthCheckResult = {
  url: string;
  ok: boolean;
  status?: number;
  latencyMs?: number;
  error?: string;
};

const fetchWithTimeout = async (url: string, timeoutMs: number): Promise<HealthCheckResult> => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  const startedAt = Date.now();
  try {
    const res = await fetch(url, { signal: controller.signal });
    const latencyMs = Date.now() - startedAt;
    if (!res.ok) {
      return { url, ok: false, status: res.status, latencyMs, error: `status_${res.status}` };
    }
    return { url, ok: true, status: res.status, latencyMs };
  } catch (err) {
    const latencyMs = Date.now() - startedAt;
    return { url, ok: false, latencyMs, error: err instanceof Error ? err.message : String(err) };
  } finally {
    clearTimeout(timeout);
  }
};

const syncComplianceCache = async (payload: SyncComplianceCachePayload) => {
  if (!complianceHealthUrls.length) {
    throw new Error('compliance_health_urls_missing');
  }
  const results: HealthCheckResult[] = [];
  for (const url of complianceHealthUrls) {
    results.push(await fetchWithTimeout(url, complianceTimeoutMs));
  }
  const ok = results.every((result) => result.ok);
  const summary = {
    generatedAt: nowIso(),
    since: payload?.since,
    status: ok ? 'ok' : 'degraded',
    endpoints: results
  };
  await fs.mkdir(path.dirname(complianceCachePath), { recursive: true });
  await fs.writeFile(complianceCachePath, `${JSON.stringify(summary, null, 2)}\n`, 'utf-8');
  return { status: summary.status, path: complianceCachePath };
};

const runQueueJob = async (job: BullJob) => {
  switch (job.name) {
    case 'sync-compliance-cache':
      return syncComplianceCache(job.data as SyncComplianceCachePayload);
    default:
      throw new Error(`unsupported_queue_job ${job.name}`);
  }
};

const setQueueState = (update: Partial<JobState>) => {
  if (!queueName) return;
  const state = getJobState(`queue:${queueName}`);
  Object.assign(state, update);
};

const handleQueueJob = async (job: BullJob) => {
  const jobName = job.name || 'unnamed';
  const allowed = queueAllowedJobs.size === 0 || queueAllowedJobs.has(jobName);
  if (!allowed) {
    const message = `queue job ${jobName} not allowed`;
    if (queueMode === 'strict') {
      throw new Error(message);
    }
    console.warn(`[worker] ${message}`);
    return { skipped: true };
  }
  setQueueState({ running: true, lastRunAt: nowIso() });
  if (queueMode === 'log-only') {
    console.log(`[worker] queue job ${jobName} received`, { id: job.id });
    setQueueState({ running: false, lastSuccessAt: nowIso() });
    return { logged: true };
  }
  try {
    const result = await runQueueJob(job);
    setQueueState({ running: false, lastSuccessAt: nowIso() });
    return result;
  } catch (err) {
    setQueueState({ running: false, lastErrorAt: nowIso(), lastError: err instanceof Error ? err.message : String(err) });
    throw err;
  }
};

const startQueueWorker = () => {
  if (!queueEnabled) return;
  if (!queueName) {
    throw new Error('WORKER_QUEUE_NAME must be set when WORKER_QUEUE_ENABLED=true');
  }
  if (!queueRedisUrl) {
    throw new Error('WORKER_REDIS_URL or REDIS_URL must be set when WORKER_QUEUE_ENABLED=true');
  }
  queueConnection = new Redis(queueRedisUrl, { maxRetriesPerRequest: null });
  queueWorker = new BullWorker(queueName, handleQueueJob, {
    connection: queueConnection,
    concurrency: queueConcurrency
  });
  queueWorker.on('ready', () => {
    setQueueState({ lastSuccessAt: nowIso(), lastRunAt: nowIso(), running: false });
    console.log(`[worker] queue ${queueName} ready`);
  });
  queueWorker.on('completed', (job) => {
    setQueueState({ lastSuccessAt: nowIso(), lastRunAt: nowIso(), running: false });
    console.log(`[worker] queue job ${job?.name} completed`);
  });
  queueWorker.on('failed', (job, err) => {
    setQueueState({ lastErrorAt: nowIso(), lastError: err?.message, lastRunAt: nowIso(), running: false });
    console.error(`[worker] queue job ${job?.name} failed`, err);
  });
  queueWorker.on('error', (err) => {
    setQueueState({ lastErrorAt: nowIso(), lastError: err?.message, lastRunAt: nowIso(), running: false });
    console.error('[worker] queue error', err);
  });
};

const stopQueueWorker = async () => {
  if (queueWorker) {
    await queueWorker.close();
    queueWorker = undefined;
  }
  if (queueConnection) {
    await queueConnection.quit();
    queueConnection = undefined;
  }
};

const buildHealthSnapshot = () => {
  const jobs = Array.from(jobStates.entries()).map(([name, state]) => ({ name, ...state }));
  const hasFailures = jobs.some((job) => job.lastErrorAt && (!job.lastSuccessAt || job.lastErrorAt >= job.lastSuccessAt));
  const status = hasFailures ? 'degraded' : 'ok';
  return {
    status,
    uptimeSeconds: Math.floor(process.uptime()),
    jobs
  };
};

const startHealthServer = () => {
  const port = Number(process.env.WORKER_HEALTH_PORT || 0);
  if (!Number.isFinite(port) || port <= 0) return;
  const host = process.env.WORKER_HEALTH_HOST || '0.0.0.0';
  const server = createServer((req, res) => {
    if (req.url?.startsWith('/health')) {
      const body = JSON.stringify(buildHealthSnapshot());
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(body);
      return;
    }
    res.writeHead(404);
    res.end();
  });
  server.listen(port, host, () => {
    console.log(`[worker] health server listening on ${host}:${port}`);
  });
  return server;
};

const shutdown = (signal: string) => {
  console.log(`[worker] ${signal} received, shutting down`);
  for (const timer of jobTimers.values()) {
    clearInterval(timer);
  }
  void stopQueueWorker().finally(() => process.exit(0));
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

const main = async () => {
  const jobs = [heartbeatJob, healthcheckJob].filter(Boolean) as Job[];
  for (const job of jobs) {
    scheduleJob(job);
  }
  startHealthServer();
  startQueueWorker();
  if (process.env.WORKER_RUN_ONCE === 'true') {
    for (const timer of jobTimers.values()) {
      clearInterval(timer);
    }
    await stopQueueWorker();
  }
};

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
