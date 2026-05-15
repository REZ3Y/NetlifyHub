import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { authenticateRequest } from '../services/auth.service.js';
import {
  createLinkedNetlifyAccount,
  deleteLinkedNetlifyAccount,
  getLinkedNetlifyAccount,
  listLinkedNetlifyAccountsPaged,
  setLinkedNetlifyAccountEnabled,
  updateLinkedNetlifyAccount,
} from '../services/netlify-linked-account.service.js';
import { fetchLinkedNetlifyAccountUsage } from '../services/netlify-account-usage.service.js';
import {
  fetchLinkedNetlifyAccountSites,
  streamLinkedNetlifySiteThumbnail,
} from '../services/netlify-account-sites.service.js';
import {
  fetchLinkedNetlifySiteObservability,
  type ObservabilityRange,
} from '../services/netlify-site-observability.service.js';
import {
  deleteLinkedNetlifySiteEnvVar,
  fetchLinkedNetlifySiteEnvVars,
  saveLinkedNetlifySiteEnvVar,
} from '../services/netlify-site-env.service.js';
import { upsertLinkedSitePanelNote } from '../services/netlify-linked-site-note.service.js';
import {
  deployLinkedNetlifySiteFromArtifact,
  deployLinkedNetlifySiteFromZip,
  fetchLinkedNetlifySiteDeploys,
  restoreLinkedNetlifySiteDeploy,
} from '../services/netlify-site-deploy.service.js';
import type { MultipartFile } from '@fastify/multipart';

const createBody = z.object({
  title: z.string().max(128).optional(),
  apiToken: z.string().min(1).max(4096),
});

const idParams = z.object({ id: z.string().min(1) });

const siteIdParams = z.object({
  id: z.string().min(1),
  siteId: z.string().min(1),
});

const deployIdParams = z.object({
  id: z.string().min(1),
  siteId: z.string().min(1),
  deployId: z.string().min(1),
});

const deployFromArtifactBody = z.object({
  artifactId: z.string().min(1),
});

const envKeyParams = z.object({
  id: z.string().min(1),
  siteId: z.string().min(1),
  envKey: z.string().min(1),
});

const deleteEnvQuery = z.object({
  triggerRedeploy: z
    .enum(['true', 'false'])
    .optional()
    .transform((v) => (v === undefined ? true : v !== 'false')),
});

const observabilityQuery = z.object({
  range: z.enum(['1h', '6h', '24h', '7d']).default('1h'),
});

const saveSiteNoteBody = z.object({
  note: z.string().max(512).nullable(),
});

const saveEnvBody = z.object({
  key: z.string().min(1).max(256),
  value: z.string().max(8192),
  context: z.enum(['all', 'production', 'deploy-preview', 'branch-deploy', 'dev']).default('all'),
  isSecret: z.boolean().optional(),
  triggerRedeploy: z.boolean().optional(),
});

const listQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(50),
});

const patchBody = z
  .object({
    title: z.string().max(128).nullable().optional(),
    apiToken: z.string().min(1).max(4096).optional(),
  })
  .superRefine((b, ctx) => {
    if (b.title === undefined && b.apiToken === undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Provide title and/or apiToken',
      });
    }
  });

const enabledBody = z.object({
  enabled: z.boolean(),
});

export const netlifyAccountsRoutes: FastifyPluginAsync = async (app) => {
  app.get('/', async (request, reply) => {
    const user = await authenticateRequest(request, reply);
    if (!user) return;

    const q = listQuery.safeParse(request.query);
    if (!q.success) {
      return reply.code(400).send({
        error: 'VALIDATION_ERROR',
        message: 'Invalid query',
        details: q.error.flatten(),
      });
    }

    const { page, pageSize } = q.data;
    const { accounts, total } = await listLinkedNetlifyAccountsPaged(user.id, { page, pageSize });
    return { accounts, total, page, pageSize };
  });

  app.post('/', async (request, reply) => {
    const user = await authenticateRequest(request, reply);
    if (!user) return;

    const parsed = createBody.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({
        error: 'VALIDATION_ERROR',
        message: 'Invalid payload',
        details: parsed.error.flatten(),
      });
    }

    const result = await createLinkedNetlifyAccount(app.config, user.id, {
      label: parsed.data.title,
      apiToken: parsed.data.apiToken,
    });

    if (!result.ok) {
      return reply.code(result.status).send({
        error: result.error,
        message: result.message,
      });
    }

    return { account: result.account };
  });

  app.patch('/:id/enabled', async (request, reply) => {
    const user = await authenticateRequest(request, reply);
    if (!user) return;

    const p = idParams.safeParse(request.params);
    if (!p.success) {
      return reply.code(400).send({ error: 'VALIDATION_ERROR', message: 'Invalid id' });
    }

    const body = enabledBody.safeParse(request.body);
    if (!body.success) {
      return reply.code(400).send({
        error: 'VALIDATION_ERROR',
        message: 'Invalid payload',
        details: body.error.flatten(),
      });
    }

    const account = await setLinkedNetlifyAccountEnabled(user.id, p.data.id, body.data.enabled);
    if (!account) {
      return reply.code(404).send({ error: 'NOT_FOUND', message: 'Linked account not found.' });
    }
    return { account };
  });

  app.get('/:id/sites/:siteId/thumbnail', async (request, reply) => {
    const user = await authenticateRequest(request, reply);
    if (!user) return;

    const p = siteIdParams.safeParse(request.params);
    if (!p.success) {
      return reply.code(400).send({ error: 'VALIDATION_ERROR', message: 'Invalid id' });
    }

    const linked = await getLinkedNetlifyAccount(user.id, p.data.id);
    if (!linked) {
      return reply.code(404).send({ error: 'NOT_FOUND', message: 'Linked account not found.' });
    }

    await streamLinkedNetlifySiteThumbnail(app.config, user.id, p.data.id, p.data.siteId, reply);
  });

  app.put('/:id/sites/:siteId/note', async (request, reply) => {
    const user = await authenticateRequest(request, reply);
    if (!user) return;

    const p = siteIdParams.safeParse(request.params);
    if (!p.success) {
      return reply.code(400).send({ error: 'VALIDATION_ERROR', message: 'Invalid id' });
    }

    const body = saveSiteNoteBody.safeParse(request.body);
    if (!body.success) {
      return reply.code(400).send({
        error: 'VALIDATION_ERROR',
        message: 'Invalid payload',
        details: body.error.flatten(),
      });
    }

    const result = await upsertLinkedSitePanelNote(
      user.id,
      p.data.id,
      p.data.siteId,
      body.data.note
    );
    if (!result) {
      return reply.code(404).send({ error: 'NOT_FOUND', message: 'Linked account not found.' });
    }
    return { panelNote: result.panelNote };
  });

  app.get('/:id/sites/:siteId/env', async (request, reply) => {
    const user = await authenticateRequest(request, reply);
    if (!user) return;

    const p = siteIdParams.safeParse(request.params);
    if (!p.success) {
      return reply.code(400).send({ error: 'VALIDATION_ERROR', message: 'Invalid id' });
    }

    const linked = await getLinkedNetlifyAccount(user.id, p.data.id);
    if (!linked) {
      return reply.code(404).send({ error: 'NOT_FOUND', message: 'Linked account not found.' });
    }

    const result = await fetchLinkedNetlifySiteEnvVars(
      app.config,
      user.id,
      p.data.id,
      p.data.siteId
    );
    if (!result.ok) {
      return reply.code(result.status).send({
        error: result.error,
        message: result.message,
      });
    }
    return { envVars: result.envVars };
  });

  app.post('/:id/sites/:siteId/env', async (request, reply) => {
    const user = await authenticateRequest(request, reply);
    if (!user) return;

    const p = siteIdParams.safeParse(request.params);
    if (!p.success) {
      return reply.code(400).send({ error: 'VALIDATION_ERROR', message: 'Invalid id' });
    }

    const body = saveEnvBody.safeParse(request.body);
    if (!body.success) {
      return reply.code(400).send({
        error: 'VALIDATION_ERROR',
        message: 'Invalid payload',
        details: body.error.flatten(),
      });
    }

    const linked = await getLinkedNetlifyAccount(user.id, p.data.id);
    if (!linked) {
      return reply.code(404).send({ error: 'NOT_FOUND', message: 'Linked account not found.' });
    }

    const result = await saveLinkedNetlifySiteEnvVar(
      app.config,
      user.id,
      p.data.id,
      p.data.siteId,
      body.data
    );
    if (!result.ok) {
      return reply.code(result.status).send({
        error: result.error,
        message: result.message,
      });
    }
    return result.result;
  });

  app.delete('/:id/sites/:siteId/env/:envKey', async (request, reply) => {
    const user = await authenticateRequest(request, reply);
    if (!user) return;

    const p = envKeyParams.safeParse(request.params);
    if (!p.success) {
      return reply.code(400).send({ error: 'VALIDATION_ERROR', message: 'Invalid id' });
    }

    const q = deleteEnvQuery.safeParse(request.query);
    if (!q.success) {
      return reply.code(400).send({
        error: 'VALIDATION_ERROR',
        message: 'Invalid query',
        details: q.error.flatten(),
      });
    }

    const linked = await getLinkedNetlifyAccount(user.id, p.data.id);
    if (!linked) {
      return reply.code(404).send({ error: 'NOT_FOUND', message: 'Linked account not found.' });
    }

    const result = await deleteLinkedNetlifySiteEnvVar(
      app.config,
      user.id,
      p.data.id,
      p.data.siteId,
      decodeURIComponent(p.data.envKey),
      { triggerRedeploy: q.data.triggerRedeploy }
    );
    if (!result.ok) {
      return reply.code(result.status).send({
        error: result.error,
        message: result.message,
      });
    }
    return result.result;
  });

  app.get('/:id/sites/:siteId/deploys', async (request, reply) => {
    const user = await authenticateRequest(request, reply);
    if (!user) return;

    const p = siteIdParams.safeParse(request.params);
    if (!p.success) {
      return reply.code(400).send({ error: 'VALIDATION_ERROR', message: 'Invalid id' });
    }

    const linked = await getLinkedNetlifyAccount(user.id, p.data.id);
    if (!linked) {
      return reply.code(404).send({ error: 'NOT_FOUND', message: 'Linked account not found.' });
    }

    const result = await fetchLinkedNetlifySiteDeploys(
      app.config,
      user.id,
      p.data.id,
      p.data.siteId
    );
    if (!result.ok) {
      return reply.code(result.status).send({
        error: result.error,
        message: result.message,
      });
    }
    return { deploys: result.deploys };
  });

  app.post('/:id/sites/:siteId/deploys', async (request, reply) => {
    const user = await authenticateRequest(request, reply);
    if (!user) return;

    const p = siteIdParams.safeParse(request.params);
    if (!p.success) {
      return reply.code(400).send({ error: 'VALIDATION_ERROR', message: 'Invalid id' });
    }

    const linked = await getLinkedNetlifyAccount(user.id, p.data.id);
    if (!linked) {
      return reply.code(404).send({ error: 'NOT_FOUND', message: 'Linked account not found.' });
    }

    const contentType = request.headers['content-type'] ?? '';
    if (contentType.includes('multipart/form-data')) {
      let file: MultipartFile | undefined;
      const parts = request.parts();
      for await (const part of parts) {
        if (part.type === 'file' && part.fieldname === 'file') {
          file = part;
        } else if (part.type === 'file') {
          await part.toBuffer();
        }
      }
      if (!file) {
        return reply.code(400).send({
          error: 'VALIDATION_ERROR',
          message: 'Zip file is required.',
        });
      }
      const buf = await file.toBuffer();
      const result = await deployLinkedNetlifySiteFromZip(
        app.config,
        user.id,
        p.data.id,
        p.data.siteId,
        new Uint8Array(buf)
      );
      if (!result.ok) {
        return reply.code(result.status).send({
          error: result.error,
          message: result.message,
        });
      }
      return result.result;
    }

    const body = deployFromArtifactBody.safeParse(request.body);
    if (!body.success) {
      return reply.code(400).send({
        error: 'VALIDATION_ERROR',
        message: 'Provide multipart zip file or JSON { artifactId }.',
        details: body.error.flatten(),
      });
    }

    const result = await deployLinkedNetlifySiteFromArtifact(
      app.config,
      user.id,
      p.data.id,
      p.data.siteId,
      body.data.artifactId
    );
    if (!result.ok) {
      return reply.code(result.status).send({
        error: result.error,
        message: result.message,
      });
    }
    return result.result;
  });

  app.post('/:id/sites/:siteId/deploys/:deployId/restore', async (request, reply) => {
    const user = await authenticateRequest(request, reply);
    if (!user) return;

    const p = deployIdParams.safeParse(request.params);
    if (!p.success) {
      return reply.code(400).send({ error: 'VALIDATION_ERROR', message: 'Invalid id' });
    }

    const linked = await getLinkedNetlifyAccount(user.id, p.data.id);
    if (!linked) {
      return reply.code(404).send({ error: 'NOT_FOUND', message: 'Linked account not found.' });
    }

    const result = await restoreLinkedNetlifySiteDeploy(
      app.config,
      user.id,
      p.data.id,
      p.data.siteId,
      p.data.deployId
    );
    if (!result.ok) {
      return reply.code(result.status).send({
        error: result.error,
        message: result.message,
      });
    }
    return result.result;
  });

  app.get('/:id/sites/:siteId/observability', async (request, reply) => {
    const user = await authenticateRequest(request, reply);
    if (!user) return;

    const p = siteIdParams.safeParse(request.params);
    if (!p.success) {
      return reply.code(400).send({ error: 'VALIDATION_ERROR', message: 'Invalid id' });
    }

    const q = observabilityQuery.safeParse(request.query);
    if (!q.success) {
      return reply.code(400).send({
        error: 'VALIDATION_ERROR',
        message: 'Invalid query',
        details: q.error.flatten(),
      });
    }

    const linked = await getLinkedNetlifyAccount(user.id, p.data.id);
    if (!linked) {
      return reply.code(404).send({ error: 'NOT_FOUND', message: 'Linked account not found.' });
    }

    const result = await fetchLinkedNetlifySiteObservability(
      app.config,
      user.id,
      p.data.id,
      p.data.siteId,
      q.data.range as ObservabilityRange
    );
    if (!result.ok) {
      return reply.code(result.status).send({
        error: result.error,
        message: result.message,
      });
    }
    return { observability: result.observability };
  });

  app.get('/:id/sites', async (request, reply) => {
    const user = await authenticateRequest(request, reply);
    if (!user) return;

    const p = idParams.safeParse(request.params);
    if (!p.success) {
      return reply.code(400).send({ error: 'VALIDATION_ERROR', message: 'Invalid id' });
    }

    const linked = await getLinkedNetlifyAccount(user.id, p.data.id);
    if (!linked) {
      return reply.code(404).send({ error: 'NOT_FOUND', message: 'Linked account not found.' });
    }

    const result = await fetchLinkedNetlifyAccountSites(app.config, user.id, p.data.id);
    if (!result.ok) {
      return reply.code(result.status).send({
        error: result.error,
        message: result.message,
      });
    }
    return { teamName: result.teamName, sites: result.sites };
  });

  app.get('/:id/usage', async (request, reply) => {
    const user = await authenticateRequest(request, reply);
    if (!user) return;

    const p = idParams.safeParse(request.params);
    if (!p.success) {
      return reply.code(400).send({ error: 'VALIDATION_ERROR', message: 'Invalid id' });
    }

    const linked = await getLinkedNetlifyAccount(user.id, p.data.id);
    if (!linked) {
      return reply.code(404).send({ error: 'NOT_FOUND', message: 'Linked account not found.' });
    }

    const result = await fetchLinkedNetlifyAccountUsage(app.config, user.id, p.data.id);
    if (!result.ok) {
      return reply.code(result.status).send({
        error: result.error,
        message: result.message,
      });
    }
    return { usage: result.usage };
  });

  app.get('/:id', async (request, reply) => {
    const user = await authenticateRequest(request, reply);
    if (!user) return;

    const p = idParams.safeParse(request.params);
    if (!p.success) {
      return reply.code(400).send({ error: 'VALIDATION_ERROR', message: 'Invalid id' });
    }

    const account = await getLinkedNetlifyAccount(user.id, p.data.id);
    if (!account) {
      return reply.code(404).send({ error: 'NOT_FOUND', message: 'Linked account not found.' });
    }
    return { account };
  });

  app.patch('/:id', async (request, reply) => {
    const user = await authenticateRequest(request, reply);
    if (!user) return;

    const p = idParams.safeParse(request.params);
    if (!p.success) {
      return reply.code(400).send({ error: 'VALIDATION_ERROR', message: 'Invalid id' });
    }

    const parsed = patchBody.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({
        error: 'VALIDATION_ERROR',
        message: 'Invalid payload',
        details: parsed.error.flatten(),
      });
    }

    const result = await updateLinkedNetlifyAccount(app.config, user.id, p.data.id, {
      label: parsed.data.title,
      apiToken: parsed.data.apiToken,
    });

    if (!result.ok) {
      return reply.code(result.status).send({
        error: result.error,
        message: result.message,
      });
    }
    return { account: result.account };
  });

  app.delete('/:id', async (request, reply) => {
    const user = await authenticateRequest(request, reply);
    if (!user) return;

    const p = idParams.safeParse(request.params);
    if (!p.success) {
      return reply.code(400).send({ error: 'VALIDATION_ERROR', message: 'Invalid id' });
    }

    const ok = await deleteLinkedNetlifyAccount(user.id, p.data.id);
    if (!ok) {
      return reply.code(404).send({ error: 'NOT_FOUND', message: 'Linked account not found.' });
    }
    return reply.code(204).send();
  });
};
