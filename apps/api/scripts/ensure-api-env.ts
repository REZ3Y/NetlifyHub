/**
 * Load `apps/api/.env` before any other app imports.
 * `pnpm --filter @netlifyhub/api run …` uses the repo root as cwd, so `dotenv/config` alone
 * would read the wrong `.env` file.
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from 'dotenv';

const dir = path.dirname(fileURLToPath(import.meta.url));
/** Prefer `apps/api/.env` over variables already injected by the shell / parent `.env`. */
config({ path: path.join(dir, '../.env'), override: true });
