import 'dotenv/config';
import cookie from '@fastify/cookie';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import Fastify from 'fastify';
import type { Env } from './config/env.js';
import { getPinoLoggerOptions } from './config/logger.js';
import { authRoutes } from './routes/auth.routes.js';
import { healthRoutes } from './routes/health.routes.js';
import { meRoutes } from './routes/me.routes.js';
import { netlifyAccountsRoutes } from './routes/netlify-accounts.routes.js';
import { registerSpaStatic } from './plugins/spa-static.js';

declare module 'fastify' {
  interface FastifyInstance {
    config: Env;
  }
}

export async function buildApp(env: Env) {
  const app = Fastify({
    logger: getPinoLoggerOptions(env),
    trustProxy: true,
    requestIdHeader: 'x-request-id',
    genReqId: () => crypto.randomUUID(),
  });

  app.decorate('config', env);

  await app.register(helmet, {
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false,
  });

  await app.register(cors, {
    origin: env.WEB_ORIGIN,
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'X-Request-Id'],
  });

  await app.register(cookie);

  await app.register(rateLimit, {
    global: true,
    max: 400,
    timeWindow: '1 minute',
  });

  await app.register(healthRoutes);
  await app.register(authRoutes, { prefix: '/v1/auth' });
  await app.register(meRoutes, { prefix: '/v1/me' });
  await app.register(netlifyAccountsRoutes, { prefix: '/v1/netlify-accounts' });

  if (env.STATIC_WEB_ROOT) {
    await registerSpaStatic(app, env.STATIC_WEB_ROOT);
  }

  return app;
}
