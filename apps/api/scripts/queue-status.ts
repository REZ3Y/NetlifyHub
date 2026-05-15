/**
 * Inspect BullMQ telegram-quota queue (repeatable jobs + waiting/active counts).
 * Usage: pnpm queue:status
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

const cronPattern = process.env.TELEGRAM_QUOTA_CRON_PATTERN?.trim() ?? '(default 0 * * * *)';

const connection = new Redis(redisUrl, { maxRetriesPerRequest: null });
const queue = new Queue(TELEGRAM_QUOTA_QUEUE, { connection });

try {
  const [repeatable, waiting, active, completed, failed, delayed] = await Promise.all([
    queue.getRepeatableJobs(),
    queue.getWaitingCount(),
    queue.getActiveCount(),
    queue.getCompletedCount(),
    queue.getFailedCount(),
    queue.getDelayedCount(),
  ]);

  console.log('--- NetlifyHub queue status ---');
  console.log('Queue:', TELEGRAM_QUOTA_QUEUE);
  console.log('REDIS_URL:', redisUrl.replace(/:[^:@/]+@/, ':***@'));
  console.log('TELEGRAM_QUOTA_CRON_PATTERN (from env):', cronPattern);
  if (cronPattern.includes(' ') && !process.env.TELEGRAM_QUOTA_CRON_PATTERN?.includes('*')) {
    console.warn(
      '\nWarning: cron pattern may be truncated. In .env use quotes, e.g. TELEGRAM_QUOTA_CRON_PATTERN="*/1 * * * *"\n'
    );
  }
  console.log(
    '\nCounts: waiting=%d active=%d delayed=%d completed=%d failed=%d',
    waiting,
    active,
    delayed,
    completed,
    failed
  );
  console.log('\nRepeatable jobs:');
  if (!repeatable.length) {
    console.log(
      '  (none — start the API once to register the scheduler, or run pnpm telegram:trigger)'
    );
  } else {
    for (const job of repeatable) {
      console.log('  -', job.name, 'pattern:', job.pattern, 'next:', job.next);
    }
  }
  const telegramRepeat = repeatable.filter((j) => j.name === TELEGRAM_QUOTA_JOB_NAME);
  if (!telegramRepeat.length) {
    console.log(
      '\nNo hourly-quota-check repeatable job. Is the API running? Scheduler registers on API startup.'
    );
  }

  const recent = await queue.getJobs(
    ['completed', 'failed', 'waiting', 'active', 'delayed'],
    0,
    8,
    true
  );
  console.log('\nRecent jobs (newest first, up to 8):');
  if (!recent.length) {
    console.log('  (none)');
  } else {
    for (const job of recent) {
      const state = await job.getState();
      console.log(
        '  -',
        `id=${job.id}`,
        `name=${job.name}`,
        `state=${state}`,
        job.finishedOn ? `finished=${new Date(job.finishedOn).toISOString()}` : ''
      );
      if (job.returnvalue && typeof job.returnvalue === 'object') {
        console.log('    result:', JSON.stringify(job.returnvalue));
      }
      if (job.failedReason) {
        console.log('    failedReason:', job.failedReason);
      }
    }
  }

  if (waiting === 0 && active === 0 && completed === 0 && failed === 0) {
    console.log(
      '\nIf you ran telegram:trigger but completed=0, the worker is likely not running. Use: pnpm dev'
    );
  }
} finally {
  await queue.close();
  await connection.quit();
}
