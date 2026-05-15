import 'dotenv/config';
import { buildApp } from './app.js';
import { loadEnv } from './config/env.js';
import { registerTelegramQuotaScheduler } from './lib/telegram-queue-scheduler.js';

async function main() {
  const env = loadEnv();
  try {
    await registerTelegramQuotaScheduler(env.REDIS_URL);
  } catch (err) {
    console.warn('Telegram quota scheduler registration failed:', err);
  }
  const app = await buildApp(env);
  await app.listen({ port: env.PORT, host: env.HOST });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
