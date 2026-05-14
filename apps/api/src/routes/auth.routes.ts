import type { FastifyPluginAsync } from 'fastify';
import rateLimit from '@fastify/rate-limit';
import { z } from 'zod';
import {
  clearSessionCookie,
  logoutFromCookie,
  performLogin,
  setSessionCookie,
} from '../services/auth.service.js';
import { SESSION_COOKIE_NAME } from '@netlifyhub/shared';

const loginBody = z.object({
  username: z.string().min(1).max(64),
  password: z.string().min(1).max(256),
});

export const authRoutes: FastifyPluginAsync = async (app) => {
  const cfg = app.config;

  await app.register(async (loginScope) => {
    await loginScope.register(rateLimit, {
      max: 12,
      timeWindow: '15 minutes',
      errorResponseBuilder: () => ({
        statusCode: 429,
        error: 'TOO_MANY_REQUESTS',
        message: 'Too many login attempts. Try again later.',
      }),
    });

    loginScope.post('/login', async (request, reply) => {
      const parsed = loginBody.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send({
          error: 'VALIDATION_ERROR',
          message: 'Invalid payload',
          details: parsed.error.flatten(),
        });
      }
      const { username, password } = parsed.data;
      const result = await performLogin(cfg, username, password);
      if (!result.ok) {
        return reply.code(401).send({ error: result.error, message: result.message });
      }
      setSessionCookie(reply, cfg, result.rawSession);
      return { user: result.user };
    });
  });

  app.post('/logout', async (request, reply) => {
    const raw = request.cookies[SESSION_COOKIE_NAME];
    await logoutFromCookie(raw);
    clearSessionCookie(reply, cfg);
    return { ok: true };
  });
};
