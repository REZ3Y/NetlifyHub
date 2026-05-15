import { prisma } from '../db/prisma.js';
import type { Env } from '../config/env.js';
import {
  deleteArtifactFile,
  isZipFilename,
  MAX_DEPLOY_ZIP_BYTES,
  readArtifactZip,
  saveArtifactZip,
} from '../lib/upload-storage.js';

export type PanelDeployArtifactDto = {
  id: string;
  title: string;
  originalFilename: string;
  sizeBytes: number;
  createdAt: string;
  updatedAt: string;
};

function mapRow(row: {
  id: string;
  title: string;
  originalFilename: string;
  sizeBytes: number;
  createdAt: Date;
  updatedAt: Date;
}): PanelDeployArtifactDto {
  return {
    id: row.id,
    title: row.title,
    originalFilename: row.originalFilename,
    sizeBytes: row.sizeBytes,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function listPanelDeployArtifacts(userId: string): Promise<PanelDeployArtifactDto[]> {
  const rows = await prisma.panelDeployArtifact.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      title: true,
      originalFilename: true,
      sizeBytes: true,
      createdAt: true,
      updatedAt: true,
    },
  });
  return rows.map(mapRow);
}

export async function getPanelDeployArtifact(
  userId: string,
  artifactId: string
): Promise<PanelDeployArtifactDto | null> {
  const row = await prisma.panelDeployArtifact.findFirst({
    where: { id: artifactId, userId },
    select: {
      id: true,
      title: true,
      originalFilename: true,
      sizeBytes: true,
      createdAt: true,
      updatedAt: true,
    },
  });
  return row ? mapRow(row) : null;
}

export async function readPanelDeployArtifactZip(
  env: Env,
  userId: string,
  artifactId: string
): Promise<
  { ok: true; bytes: Uint8Array } | { ok: false; error: string; message: string; status: number }
> {
  const row = await prisma.panelDeployArtifact.findFirst({
    where: { id: artifactId, userId },
    select: { storagePath: true },
  });
  if (!row) {
    return { ok: false, error: 'NOT_FOUND', message: 'Deploy file not found.', status: 404 };
  }
  try {
    const bytes = await readArtifactZip(env, row.storagePath);
    return { ok: true, bytes };
  } catch {
    return {
      ok: false,
      error: 'FILE_MISSING',
      message: 'Stored zip file is missing on disk.',
      status: 404,
    };
  }
}

export async function createPanelDeployArtifact(
  env: Env,
  userId: string,
  input: { title: string; originalFilename: string; zip: Uint8Array }
): Promise<
  | { ok: true; artifact: PanelDeployArtifactDto }
  | { ok: false; error: string; message: string; status: number }
> {
  const title = input.title.trim();
  if (!title) {
    return { ok: false, error: 'VALIDATION_ERROR', message: 'Title is required.', status: 400 };
  }
  if (!isZipFilename(input.originalFilename)) {
    return {
      ok: false,
      error: 'VALIDATION_ERROR',
      message: 'Only .zip files are supported.',
      status: 400,
    };
  }
  if (input.zip.byteLength > MAX_DEPLOY_ZIP_BYTES) {
    return {
      ok: false,
      error: 'FILE_TOO_LARGE',
      message: `Zip must be at most ${MAX_DEPLOY_ZIP_BYTES} bytes.`,
      status: 413,
    };
  }

  const row = await prisma.panelDeployArtifact.create({
    data: {
      userId,
      title,
      originalFilename: input.originalFilename.trim(),
      storagePath: 'pending',
      sizeBytes: input.zip.byteLength,
    },
    select: { id: true },
  });

  try {
    const storagePath = await saveArtifactZip(env, userId, row.id, input.zip);
    const updated = await prisma.panelDeployArtifact.update({
      where: { id: row.id },
      data: { storagePath },
      select: {
        id: true,
        title: true,
        originalFilename: true,
        sizeBytes: true,
        createdAt: true,
        updatedAt: true,
      },
    });
    return { ok: true, artifact: mapRow(updated) };
  } catch (e) {
    await prisma.panelDeployArtifact.delete({ where: { id: row.id } }).catch(() => undefined);
    const msg = e instanceof Error ? e.message : 'Could not store zip file.';
    return { ok: false, error: 'STORAGE_ERROR', message: msg, status: 500 };
  }
}

export async function updatePanelDeployArtifact(
  env: Env,
  userId: string,
  artifactId: string,
  input: { title?: string; originalFilename?: string; zip?: Uint8Array }
): Promise<
  | { ok: true; artifact: PanelDeployArtifactDto }
  | { ok: false; error: string; message: string; status: number }
> {
  const existing = await prisma.panelDeployArtifact.findFirst({
    where: { id: artifactId, userId },
  });
  if (!existing) {
    return { ok: false, error: 'NOT_FOUND', message: 'Deploy file not found.', status: 404 };
  }

  const title = input.title !== undefined ? input.title.trim() : existing.title;
  if (!title) {
    return { ok: false, error: 'VALIDATION_ERROR', message: 'Title is required.', status: 400 };
  }

  let originalFilename = existing.originalFilename;
  let sizeBytes = existing.sizeBytes;
  let storagePath = existing.storagePath;

  if (input.zip) {
    if (input.originalFilename && !isZipFilename(input.originalFilename)) {
      return {
        ok: false,
        error: 'VALIDATION_ERROR',
        message: 'Only .zip files are supported.',
        status: 400,
      };
    }
    if (input.zip.byteLength > MAX_DEPLOY_ZIP_BYTES) {
      return {
        ok: false,
        error: 'FILE_TOO_LARGE',
        message: `Zip must be at most ${MAX_DEPLOY_ZIP_BYTES} bytes.`,
        status: 413,
      };
    }
    await saveArtifactZip(env, userId, artifactId, input.zip);
    originalFilename = input.originalFilename?.trim() || existing.originalFilename;
    sizeBytes = input.zip.byteLength;
    storagePath = existing.storagePath;
  }

  const updated = await prisma.panelDeployArtifact.update({
    where: { id: artifactId },
    data: { title, originalFilename, sizeBytes, storagePath },
    select: {
      id: true,
      title: true,
      originalFilename: true,
      sizeBytes: true,
      createdAt: true,
      updatedAt: true,
    },
  });
  return { ok: true, artifact: mapRow(updated) };
}

export async function deletePanelDeployArtifact(
  env: Env,
  userId: string,
  artifactId: string
): Promise<boolean> {
  const existing = await prisma.panelDeployArtifact.findFirst({
    where: { id: artifactId, userId },
    select: { storagePath: true },
  });
  if (!existing) return false;
  await prisma.panelDeployArtifact.delete({ where: { id: artifactId } });
  await deleteArtifactFile(env, existing.storagePath);
  return true;
}
