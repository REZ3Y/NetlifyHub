import fs from 'node:fs';
import path from 'node:path';
import fastifyStatic from '@fastify/static';
import type { FastifyInstance } from 'fastify';

/** Serve Vite `dist` and SPA fallback (Vue Router history). API routes must be registered first. */
export async function registerSpaStatic(app: FastifyInstance, rootDir: string) {
  const root = path.resolve(rootDir);
  if (!fs.existsSync(root)) {
    app.log.warn({ root }, 'STATIC_WEB_ROOT does not exist; SPA not mounted');
    return;
  }

  await app.register(fastifyStatic, {
    root,
    wildcard: false,
  });

  app.setNotFoundHandler(async (request, reply) => {
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      return reply.code(404).send({ error: 'NOT_FOUND' });
    }
    const pathname = (request.url ?? '').split('?')[0] ?? '';
    if (pathname.startsWith('/v1') || pathname === '/health' || pathname === '/ready') {
      return reply.code(404).send({ error: 'NOT_FOUND' });
    }
    return reply.type('text/html').sendFile('index.html', root);
  });
}
