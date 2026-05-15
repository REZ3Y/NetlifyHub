import type { FastifyPluginAsync } from 'fastify';
import { Role } from '@prisma/client';
import { z } from 'zod';
import { authenticateRequest } from '../services/auth.service.js';
import {
  getTelegramNotificationSettings,
  updateTelegramNotificationSettings,
} from '../services/telegram-settings.service.js';
import { listTelegramNotificationLogs } from '../services/telegram-notification-log.service.js';

const patchSettingsBody = z.object({
  enabled: z.boolean().optional(),
  botToken: z.string().nullable().optional(),
  recipientChatIds: z.array(z.string()).optional(),
  bandwidthThresholdPercent: z.number().int().min(1).max(100).optional(),
  creditThresholdPercent: z.number().int().min(1).max(100).optional(),
});

const logsQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

export const telegramNotificationsRoutes: FastifyPluginAsync = async (app) => {
  app.get('/settings', async (request, reply) => {
    const user = await authenticateRequest(request, reply);
    if (!user) return;
    if (user.role !== Role.ADMIN) {
      return reply.code(403).send({ error: 'FORBIDDEN', message: 'Admin access required.' });
    }
    const settings = await getTelegramNotificationSettings();
    return { settings };
  });

  app.patch('/settings', async (request, reply) => {
    const user = await authenticateRequest(request, reply);
    if (!user) return;
    if (user.role !== Role.ADMIN) {
      return reply.code(403).send({ error: 'FORBIDDEN', message: 'Admin access required.' });
    }

    const parsed = patchSettingsBody.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({
        error: 'VALIDATION_ERROR',
        message: 'Invalid payload',
        details: parsed.error.flatten(),
      });
    }

    try {
      const settings = await updateTelegramNotificationSettings(app.config, user.id, parsed.data);
      return { settings };
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Could not save settings.';
      return reply.code(500).send({ error: 'SAVE_FAILED', message });
    }
  });

  app.get('/logs', async (request, reply) => {
    const user = await authenticateRequest(request, reply);
    if (!user) return;
    if (user.role !== Role.ADMIN) {
      return reply.code(403).send({ error: 'FORBIDDEN', message: 'Admin access required.' });
    }

    const q = logsQuery.safeParse(request.query);
    if (!q.success) {
      return reply.code(400).send({
        error: 'VALIDATION_ERROR',
        message: 'Invalid query',
        details: q.error.flatten(),
      });
    }

    const result = await listTelegramNotificationLogs(q.data.page, q.data.pageSize);
    return result;
  });
};
