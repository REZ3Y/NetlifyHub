import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { authenticateRequest } from '../services/auth.service.js';
import { createLinkedNetlifyAccount } from '../services/netlify-linked-account.service.js';

const createBody = z.object({
  title: z.string().max(128).optional(),
  apiToken: z.string().min(1).max(4096),
});

export const netlifyAccountsRoutes: FastifyPluginAsync = async (app) => {
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
};
