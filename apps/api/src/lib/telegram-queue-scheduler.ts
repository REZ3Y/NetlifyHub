import { Queue } from 'bullmq';
import { Redis } from 'ioredis';
import {
  DEFAULT_TELEGRAM_QUOTA_CRON_PATTERN,
  TELEGRAM_QUOTA_JOB_NAME,
  TELEGRAM_QUOTA_QUEUE,
  TELEGRAM_QUOTA_REPEAT_JOB_ID,
} from './telegram-queue-constants.js';

function resolveTelegramQuotaCronPattern(): string {
  const raw = process.env.TELEGRAM_QUOTA_CRON_PATTERN?.trim();
  return raw && raw.length > 0 ? raw : DEFAULT_TELEGRAM_QUOTA_CRON_PATTERN;
}

export async function registerTelegramQuotaScheduler(redisUrl: string): Promise<void> {
  const cronPattern = resolveTelegramQuotaCronPattern();
  if (!cronPattern.includes('*') && !cronPattern.includes('/')) {
    console.warn(
      '[telegram-scheduler] TELEGRAM_QUOTA_CRON_PATTERN looks truncated (%s). Use quotes in .env, e.g. TELEGRAM_QUOTA_CRON_PATTERN="*/1 * * * *"',
      cronPattern
    );
  }

  const connection = new Redis(redisUrl, { maxRetriesPerRequest: null });
  const queue = new Queue(TELEGRAM_QUOTA_QUEUE, { connection });

  try {
    const repeatable = await queue.getRepeatableJobs();
    for (const job of repeatable) {
      if (job.name === TELEGRAM_QUOTA_JOB_NAME) {
        await queue.removeRepeatableByKey(job.key);
      }
    }

    await queue.add(
      TELEGRAM_QUOTA_JOB_NAME,
      {},
      {
        repeat: { pattern: cronPattern },
        jobId: TELEGRAM_QUOTA_REPEAT_JOB_ID,
        removeOnComplete: 100,
        removeOnFail: 50,
      }
    );
    console.info(
      '[telegram-scheduler] Registered repeatable job "%s" on queue "%s" with pattern: %s',
      TELEGRAM_QUOTA_JOB_NAME,
      TELEGRAM_QUOTA_QUEUE,
      cronPattern
    );
  } finally {
    await queue.close();
    await connection.quit();
  }
}
