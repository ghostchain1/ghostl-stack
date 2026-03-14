import { Worker } from 'bullmq';
import { connection } from './jobs/queue.js';
import { runRetryJob, type RetryJob } from './jobs/retry.js';
import { startAiCoreLoop } from './ai-core/scheduler.js';
import { startFeeWatcherLoop } from './fees/watcher.js';

const worker = new Worker<RetryJob>(
  'gas-deployments',
  async (job) => {
    await runRetryJob(job.data);
  },
  { connection }
);

worker.on('completed', (job) => {
  console.log(`[worker] job ${job.id} completed`);
});

worker.on('failed', (job, err) => {
  console.error(`[worker] job ${job?.id} failed`, err);
});

startAiCoreLoop();
startFeeWatcherLoop();
