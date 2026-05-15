/**
 * Load repo-root `.env` before Prisma CLI or other scripts that run with cwd at repo root.
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from 'dotenv';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '../../..');
config({ path: path.join(root, '.env'), override: true });
