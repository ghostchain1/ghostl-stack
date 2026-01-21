import { runPredictions } from './jobs/predictor';
import Redis from 'ioredis';

const intervalSeconds = Number(process.env.PREDICT_INTERVAL_SECONDS || 60);
const redisUrl = process.env.REDIS_URL || 'redis://redis:6379';
const redis = new Redis(redisUrl);

const run = async () => {
  try {
    await runPredictions();
    await redis.set('compliance:last_prediction', new Date().toISOString());
    console.log('[worker] predictions updated');
  } catch (err) {
    console.error('[worker] prediction error', err);
  }
};

const start = async () => {
  await run();
  setInterval(run, intervalSeconds * 1000);
};

start().catch((err) => {
  console.error('[worker] failed to start', err);
  process.exit(1);
});
