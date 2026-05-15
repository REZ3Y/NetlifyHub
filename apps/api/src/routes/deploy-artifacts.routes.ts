import type { FastifyPluginAsync } from 'fastify';
import type { MultipartFile } from '@fastify/multipart';
import { z } from 'zod';
import { authenticateRequest } from '../services/auth.service.js';
import {
  createPanelDeployArtifact,
  deletePanelDeployArtifact,
  listPanelDeployArtifacts,
  updatePanelDeployArtifact,
} from '../services/panel-deploy-artifact.service.js';

const idParams = z.object({ id: z.string().min(1) });

async function readMultipartZip(
  file: MultipartFile | undefined
): Promise<
  | { ok: true; originalFilename: string; zip: Uint8Array }
  | { ok: false; error: string; message: string; status: number }
> {
  if (!file) {
    return { ok: false, error: 'VALIDATION_ERROR', message: 'Zip file is required.', status: 400 };
  }
  const originalFilename = file.filename?.trim() || 'archive.zip';
  const buf = await file.toBuffer();
  return { ok: true, originalFilename, zip: new Uint8Array(buf) };
}

export const deployArtifactsRoutes: FastifyPluginAsync = async (app) => {
  app.get('/', async (request, reply) => {
    const user = await authenticateRequest(request, reply);
    if (!user) return;
    const artifacts = await listPanelDeployArtifacts(user.id);
    return { artifacts };
  });

  app.post('/', async (request, reply) => {
    const user = await authenticateRequest(request, reply);
    if (!user) return;

    let title = '';
    let file: MultipartFile | undefined;
    const parts = request.parts();
    for await (const part of parts) {
      if (part.type === 'file' && part.fieldname === 'file') {
        file = part;
      } else if (part.type === 'field' && part.fieldname === 'title') {
        title = String(part.value).trim();
      } else if (part.type === 'file') {
        await part.toBuffer();
      }
    }

    if (!title) {
      return reply.code(400).send({
        error: 'VALIDATION_ERROR',
        message: 'Title is required.',
      });
    }

    const zipResult = await readMultipartZip(file);
    if (!zipResult.ok) {
      return reply.code(zipResult.status).send({
        error: zipResult.error,
        message: zipResult.message,
      });
    }

    const result = await createPanelDeployArtifact(app.config, user.id, {
      title,
      originalFilename: zipResult.originalFilename,
      zip: zipResult.zip,
    });
    if (!result.ok) {
      return reply.code(result.status).send({
        error: result.error,
        message: result.message,
      });
    }
    return { artifact: result.artifact };
  });

  app.patch('/:id', async (request, reply) => {
    const user = await authenticateRequest(request, reply);
    if (!user) return;

    const p = idParams.safeParse(request.params);
    if (!p.success) {
      return reply.code(400).send({ error: 'VALIDATION_ERROR', message: 'Invalid id' });
    }

    let title: string | undefined;
    let file: MultipartFile | undefined;
    const parts = request.parts();
    for await (const part of parts) {
      if (part.type === 'file' && part.fieldname === 'file') {
        file = part;
      } else if (part.type === 'field' && part.fieldname === 'title') {
        const v = String(part.value).trim();
        if (v) title = v;
      } else if (part.type === 'file') {
        await part.toBuffer();
      }
    }

    let zipPayload: { originalFilename: string; zip: Uint8Array } | undefined;
    if (file) {
      const zipResult = await readMultipartZip(file);
      if (!zipResult.ok) {
        return reply.code(zipResult.status).send({
          error: zipResult.error,
          message: zipResult.message,
        });
      }
      zipPayload = {
        originalFilename: zipResult.originalFilename,
        zip: zipResult.zip,
      };
    }

    if (title === undefined && !zipPayload) {
      return reply.code(400).send({
        error: 'VALIDATION_ERROR',
        message: 'Provide title and/or a new zip file.',
      });
    }

    const result = await updatePanelDeployArtifact(app.config, user.id, p.data.id, {
      title,
      originalFilename: zipPayload?.originalFilename,
      zip: zipPayload?.zip,
    });
    if (!result.ok) {
      return reply.code(result.status).send({
        error: result.error,
        message: result.message,
      });
    }
    return { artifact: result.artifact };
  });

  app.delete('/:id', async (request, reply) => {
    const user = await authenticateRequest(request, reply);
    if (!user) return;

    const p = idParams.safeParse(request.params);
    if (!p.success) {
      return reply.code(400).send({ error: 'VALIDATION_ERROR', message: 'Invalid id' });
    }

    const ok = await deletePanelDeployArtifact(app.config, user.id, p.data.id);
    if (!ok) {
      return reply.code(404).send({ error: 'NOT_FOUND', message: 'Deploy file not found.' });
    }
    return reply.code(204).send();
  });
};
