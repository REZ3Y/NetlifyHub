import 'dotenv/config';
import { buildApp } from './app.js';
import { loadEnv } from './config/env.js';

async function main() {
  const env = loadEnv();
  const app = await buildApp(env);
  await app.listen({ port: env.PORT, host: env.HOST });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
