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

/** Load the monorepo root `.env` into `process.env` (later keys override earlier). */
export function loadRootEnv(): void {
  const root = findRepoRoot();
  config({ path: path.join(root, '.env'), override: true });
}
