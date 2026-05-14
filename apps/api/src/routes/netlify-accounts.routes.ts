import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { authenticateRequest } from '../services/auth.service.js';
import {
  createLinkedNetlifyAccount,
  deleteLinkedNetlifyAccount,
  getLinkedNetlifyAccount,
  listLinkedNetlifyAccounts,
  setLinkedNetlifyAccountEnabled,
  updateLinkedNetlifyAccount,
} from '../services/netlify-linked-account.service.js';

const createBody = z.object({
  title: z.string().max(128).optional(),
  apiToken: z.string().min(1).max(4096),
});

const idParams = z.object({ id: z.string().min(1) });

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
    const accounts = await listLinkedNetlifyAccounts(user.id);
    return { accounts };
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
