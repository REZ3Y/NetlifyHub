import fs from 'node:fs';
import path from 'node:path';
import { config } from 'dotenv';

/** Walk up from `startDir` until `pnpm-workspace.yaml` is found. */
export function findRepoRoot(startDir: string = process.cwd()): string {
  let dir = path.resolve(startDir);
  for (;;) {
    if (fs.existsSync(path.join(dir, 'pnpm-workspace.yaml'))) {
      return dir;
    }
    const parent = path.dirname(dir);
    if (parent === dir) {
      return path.resolve(startDir);
    }
    dir = parent;
  }
}

/**
 * Load repo-root `.env` without overriding variables already set (e.g. Docker Compose `environment:`).
 */
export function loadRootEnv(): void {
  const root = findRepoRoot();
  const name = process.env.NETLIFYHUB_ENV_FILE?.trim() || '.env';
  const filePath = path.join(root, name);
  if (fs.existsSync(filePath)) {
    config({ path: filePath, override: false });
  }
}
