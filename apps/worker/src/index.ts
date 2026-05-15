import { loadRootEnv } from '@netlifyhub/shared';
import { Worker } from 'bullmq';

loadRootEnv();
import pino from 'pino';
import { Redis } from 'ioredis';
import { loadEnv } from '@netlifyhub/api/env';
import { runTelegramQuotaMonitor } from '@netlifyhub/api/telegram-quota-monitor';
import { TELEGRAM_QUOTA_JOB_NAME, TELEGRAM_QUOTA_QUEUE } from './telegram-queue-constants.js';

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

const env = loadEnv();
const connection = new Redis(redisUrl, { maxRetriesPerRequest: null });

const worker = new Worker(
  TELEGRAM_QUOTA_QUEUE,
  async (job) => {
    if (job.name === TELEGRAM_QUOTA_JOB_NAME) {
      log.info({ jobId: job.id }, 'Running Telegram quota monitor');
      const result = await runTelegramQuotaMonitor(env);
      if (result && typeof result === 'object' && 'abortReason' in result && result.abortReason) {
        log.warn({ jobId: job.id, result }, 'Telegram quota monitor aborted');
      } else {
        log.info({ jobId: job.id, result }, 'Telegram quota monitor finished');
      }
      return result;
    }
    log.warn({ jobId: job.id, name: job.name }, 'Unknown job name');
    return { ok: false, reason: 'unknown_job' };
  },
  { connection }
);

worker.on('completed', (job) => {
  log.debug({ jobId: job.id }, 'Job completed');
});

worker.on('failed', (job, err) => {
  log.error({ jobId: job?.id, err }, 'Job failed');
});

log.info(
  {
    queue: TELEGRAM_QUOTA_QUEUE,
    redis: redisUrl.replace(/:[^:@/]+@/, ':***@'),
    cronPattern:
      process.env.TELEGRAM_QUOTA_CRON_PATTERN?.trim() ?? '(registered by API on startup)',
  },
  'NetlifyHub worker listening (processes jobs from Redis; scheduler runs in API)'
);

const shutdown = async () => {
  log.info('Shutting down worker');
  await worker.close();
  await connection.quit();
  process.exit(0);
};

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
