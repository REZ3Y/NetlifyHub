import type { FastifyPluginAsync } from 'fastify';
import { prisma } from '../db/prisma.js';

export const healthRoutes: FastifyPluginAsync = async (app) => {
  app.get('/health', async () => ({ status: 'ok', service: 'netlifyhub-api' }));
  app.get('/ready', async (_request, reply) => {
    try {
      await prisma.$queryRaw`SELECT 1`;
    } catch {
      return reply.code(503).send({ status: 'not_ready' });
    }
    return { status: 'ready' };
  });
};
