/**
 * Load repo-root `.env`, sync for Prisma CLI, then run a child command with that env.
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from 'dotenv';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const envPath = path.join(root, '.env');
const apiEnvPath = path.join(root, 'apps/api/.env');

const loaded = config({ path: envPath, override: true });

/** Prisma loads `apps/api/.env` (not repo root). Keep it in sync with root `.env`. */
function syncApiEnvFromRoot(): void {
  if (!fs.existsSync(envPath)) return;
  fs.mkdirSync(path.dirname(apiEnvPath), { recursive: true });
  fs.copyFileSync(envPath, apiEnvPath);
}

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

function logDatabaseUrlTarget(): void {
  const url = process.env.DATABASE_URL ?? '';
  const match = url.match(/@([^/]+)/);
  const hostPort = match?.[1] ?? '(unknown)';
  console.log(`[ensure-root-env] DATABASE_URL target: ${hostPort}`);
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

syncApiEnvFromRoot();
logDatabaseUrlTarget();

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
