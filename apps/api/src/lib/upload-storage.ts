import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { Env } from '../config/env.js';

export const MAX_DEPLOY_ZIP_BYTES = 100 * 1024 * 1024;

export function resolveUploadRoot(_env?: Env): string {
  const raw = process.env.UPLOAD_STORAGE_PATH?.trim();
  const root = raw && raw.length > 0 ? raw : path.join(process.cwd(), 'data', 'uploads');
  return path.isAbsolute(root) ? root : path.resolve(process.cwd(), root);
}

export function artifactStoragePath(userId: string, artifactId: string): string {
  return path.posix.join(userId, `${artifactId}.zip`);
}

export function absoluteArtifactPath(env: Env, storagePath: string): string {
  return path.join(resolveUploadRoot(env), storagePath);
}

export async function ensureUserUploadDir(env: Env, userId: string): Promise<string> {
  const dir = path.join(resolveUploadRoot(env), userId);
  await mkdir(dir, { recursive: true });
  return dir;
}

export async function saveArtifactZip(
  env: Env,
  userId: string,
  artifactId: string,
  bytes: Uint8Array
): Promise<string> {
  if (bytes.byteLength > MAX_DEPLOY_ZIP_BYTES) {
    throw new Error('ZIP_FILE_TOO_LARGE');
  }
  const storagePath = artifactStoragePath(userId, artifactId);
  const abs = absoluteArtifactPath(env, storagePath);
  await ensureUserUploadDir(env, userId);
  await writeFile(abs, bytes);
  return storagePath;
}

export async function readArtifactZip(env: Env, storagePath: string): Promise<Uint8Array> {
  const abs = absoluteArtifactPath(env, storagePath);
  const buf = await readFile(abs);
  return new Uint8Array(buf);
}

export async function deleteArtifactFile(env: Env, storagePath: string): Promise<void> {
  const abs = absoluteArtifactPath(env, storagePath);
  try {
    await unlink(abs);
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e;
  }
}

export function isZipFilename(name: string): boolean {
  return /\.zip$/i.test(name.trim());
}
