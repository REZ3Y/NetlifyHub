import 'dotenv/config';
import { Worker } from 'bullmq';
import pino from 'pino';
import { Redis } from 'ioredis';

const log = pino({
  level: process.env.LOG_LEVEL ?? 'info',
  transport:
    process.env.NODE_ENV === 'development'
      ? { target: 'pino-pretty', options: { colorize: true } }
      : undefined,
});

const redisUrl = process.env.REDIS_URL;
if (!redisUrl) {
  log.fatal('REDIS_URL is required');
  process.exit(1);
}

const connection = new Redis(redisUrl, { maxRetriesPerRequest: null });

/** Default queue for Netlify sync jobs (processors added in later phases). */
export const NETLIFY_SYNC_QUEUE = 'netlify-sync';

const worker = new Worker(
  NETLIFY_SYNC_QUEUE,
  async (job) => {
    log.info({ jobId: job.id, name: job.name }, 'Worker received job (placeholder)');
    return { ok: true, phase: 'bootstrap' };
  },
  { connection }
);

worker.on('completed', (job) => {
  log.debug({ jobId: job.id }, 'Job completed');
});

worker.on('failed', (job, err) => {
  log.error({ jobId: job?.id, err }, 'Job failed');
});

log.info('NetlifyHub worker listening for queue "%s"', NETLIFY_SYNC_QUEUE);

const shutdown = async () => {
  log.info('Shutting down worker');
  await worker.close();
  await connection.quit();
  process.exit(0);
};

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
