import type { FastifyPluginAsync } from 'fastify';
import { authenticateRequest } from '../services/auth.service.js';
import { getDashboardStats } from '../services/dashboard-stats.service.js';

export const dashboardRoutes: FastifyPluginAsync = async (app) => {
  app.get('/stats', async (request, reply) => {
    const user = await authenticateRequest(request, reply);
    if (!user) return;

    const stats = await getDashboardStats(user.id);
    return { stats };
  });
};
