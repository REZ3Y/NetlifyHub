import { loadRootEnv } from '@netlifyhub/shared';
import { buildApp } from './app.js';

loadRootEnv();
import { loadEnv } from './config/env.js';
import { registerTelegramQuotaScheduler } from './lib/telegram-queue-scheduler.js';

const SCHEDULER_MAX_ATTEMPTS = 8;

async function registerSchedulerWithRetry(redisUrl: string): Promise<void> {
  let lastErr: unknown;
  for (let attempt = 1; attempt <= SCHEDULER_MAX_ATTEMPTS; attempt++) {
    try {
      await registerTelegramQuotaScheduler(redisUrl);
      return;
    } catch (err) {
      lastErr = err;
      const delayMs = Math.min(2000 * attempt, 15_000);
      console.warn(
        `[telegram-scheduler] Registration attempt ${attempt}/${SCHEDULER_MAX_ATTEMPTS} failed; retry in ${delayMs}ms`,
        err
      );
      if (attempt < SCHEDULER_MAX_ATTEMPTS) {
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }
    }
  }
  console.error(
    '[telegram-scheduler] Could not register repeatable job after all attempts. Worker will idle until API restarts or you run pnpm telegram:trigger.',
    lastErr
  );
}

async function main() {
  const env = loadEnv();
  await registerSchedulerWithRetry(env.REDIS_URL);
  const app = await buildApp(env);
  await app.listen({ port: env.PORT, host: env.HOST });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
