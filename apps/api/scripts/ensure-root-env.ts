/**
 * Load repo-root `.env`, then either exit (import-only) or run a child command with that env.
 *
 * Usage:
 *   tsx apps/api/scripts/ensure-root-env.ts
 *   tsx apps/api/scripts/ensure-root-env.ts -- pnpm --filter @netlifyhub/api exec prisma migrate deploy
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from 'dotenv';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const envPath = path.join(root, '.env');

const loaded = config({ path: envPath, override: true });

function reportMissingDatabaseUrl(): void {
  if (!fs.existsSync(envPath)) {
    console.error(
      `[ensure-root-env] Missing ${envPath}. Copy .env.example to .env and set DATABASE_URL.`
    );
  } else if (loaded.parsed && !('DATABASE_URL' in loaded.parsed)) {
    console.error(`[ensure-root-env] DATABASE_URL is not set in ${envPath}.`);
  } else {
    console.error('[ensure-root-env] DATABASE_URL is empty. Check your .env file.');
  }
}

const sepIdx = process.argv.indexOf('--');
if (sepIdx === -1) {
  if (!process.env.DATABASE_URL?.trim()) {
    reportMissingDatabaseUrl();
  }
  process.exit(0);
}

if (!process.env.DATABASE_URL?.trim()) {
  reportMissingDatabaseUrl();
  process.exit(1);
}

const cmd = process.argv[sepIdx + 1];
const args = process.argv.slice(sepIdx + 2);

if (!cmd) {
  process.exit(0);
}

const child = spawnSync(cmd, args, {
  stdio: 'inherit',
  env: process.env,
  cwd: root,
  shell: process.platform === 'win32',
});

if (child.error) {
  console.error('[ensure-root-env]', child.error.message);
  process.exit(1);
}

process.exit(child.status === null ? 1 : child.status);
