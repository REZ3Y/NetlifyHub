import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { prisma } from '../db/prisma.js';
import {
  authenticateRequest,
  clearSessionCookie,
  updatePassword,
  updateUsername,
} from '../services/auth.service.js';

const patchBody = z
  .object({
    username: z.string().min(1).max(64).optional(),
    currentPassword: z.string().min(1).max(256).optional(),
    newPassword: z.string().min(8).max(256).optional(),
  })
  .superRefine((b, ctx) => {
    if (b.newPassword && !b.currentPassword) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'currentPassword is required when changing password',
        path: ['currentPassword'],
      });
    }
  });

export const meRoutes: FastifyPluginAsync = async (app) => {
  const cfg = app.config;

  app.get('/', async (request, reply) => {
    const user = await authenticateRequest(request, reply);
    if (!user) return;
    const row = await prisma.user.findUnique({
      where: { id: user.id },
      select: { id: true, username: true, role: true, createdAt: true, updatedAt: true },
    });
    if (!row) return reply.code(404).send({ error: 'NOT_FOUND', message: 'User not found' });
    return row;
  });

  app.patch('/', async (request, reply) => {
    const user = await authenticateRequest(request, reply);
    if (!user) return;

    const parsed = patchBody.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({
        error: 'VALIDATION_ERROR',
        message: 'Invalid payload',
        details: parsed.error.flatten(),
      });
    }
    const body = parsed.data;

    let passwordChanged = false;

    if (body.username && body.username !== user.username) {
      const u = await updateUsername(user.id, body.username);
      if (!u.ok) {
        return reply.code(409).send({ error: u.error, message: u.message });
      }
    }

    if (body.newPassword && body.currentPassword) {
      const p = await updatePassword(user.id, body.currentPassword, body.newPassword, cfg);
      if (!p.ok) {
        return reply.code(400).send({ error: p.error, message: p.message });
      }
      passwordChanged = true;
      clearSessionCookie(reply, cfg);
    }

    const row = await prisma.user.findUniqueOrThrow({
      where: { id: user.id },
      select: { id: true, username: true, role: true, createdAt: true, updatedAt: true },
    });

    return passwordChanged ? { user: row, mustReauth: true } : { user: row };
  });
};
