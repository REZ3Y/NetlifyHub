import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { Role } from '@prisma/client';
import { authenticateRequest } from '../services/auth.service.js';
import { getPanelSettings, updatePanelSettings } from '../services/panel-settings.service.js';
import {
  MAX_NETLIFY_CACHE_TTL_MINUTES,
  MIN_NETLIFY_CACHE_TTL_MINUTES,
} from '../lib/netlify-cache-constants.js';

const patchBody = z.object({
  netlifyCacheTtlMinutes: z
    .number()
    .int()
    .min(MIN_NETLIFY_CACHE_TTL_MINUTES)
    .max(MAX_NETLIFY_CACHE_TTL_MINUTES),
});

export const panelSettingsRoutes: FastifyPluginAsync = async (app) => {
  app.get('/', async (request, reply) => {
    const user = await authenticateRequest(request, reply);
    if (!user) return;
    if (user.role !== Role.ADMIN) {
      return reply.code(403).send({ error: 'FORBIDDEN', message: 'Admin access required.' });
    }
    const settings = await getPanelSettings();
    return { settings };
  });

  app.patch('/', async (request, reply) => {
    const user = await authenticateRequest(request, reply);
    if (!user) return;
    if (user.role !== Role.ADMIN) {
      return reply.code(403).send({ error: 'FORBIDDEN', message: 'Admin access required.' });
    }

    const parsed = patchBody.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({
        error: 'VALIDATION_ERROR',
        message: 'Invalid payload',
        details: parsed.error.flatten(),
      });
    }

    const settings = await updatePanelSettings(parsed.data);
    return { settings };
  });
};
