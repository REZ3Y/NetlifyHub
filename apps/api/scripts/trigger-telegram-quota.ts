/**
 * Enqueue one telegram quota check immediately (for testing).
 * Usage: pnpm telegram:trigger
 * Requires: Redis + worker process running (`pnpm dev` includes worker).
 */
import './ensure-root-env.js';
import { Queue } from 'bullmq';
import { Redis } from 'ioredis';
import {
  TELEGRAM_QUOTA_JOB_NAME,
  TELEGRAM_QUOTA_QUEUE,
} from '../src/lib/telegram-queue-constants.js';

const redisUrl = process.env.REDIS_URL;
if (!redisUrl) {
  console.error('REDIS_URL is not set. Add it to the repo-root .env file.');
  process.exit(1);
}

const connection = new Redis(redisUrl, { maxRetriesPerRequest: null });
const queue = new Queue(TELEGRAM_QUOTA_QUEUE, { connection });

try {
  const job = await queue.add(TELEGRAM_QUOTA_JOB_NAME, { manual: true }, { removeOnComplete: 100 });
  console.log('Enqueued job', job.id, 'on queue', TELEGRAM_QUOTA_QUEUE);
  console.log(
    'Ensure the worker is running (e.g. pnpm dev:panel or pnpm dev:worker in another terminal).'
  );
} finally {
  await queue.close();
  await connection.quit();
}
