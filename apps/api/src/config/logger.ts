import type { FastifyBaseLogger } from 'fastify';
import pino from 'pino';
import type { Env } from './env.js';

export function createLogger(env: Env): FastifyBaseLogger {
  return pino({
    level: env.LOG_LEVEL,
    ...(env.NODE_ENV === 'development'
      ? {
          transport: {
            target: 'pino-pretty',
            options: { colorize: true, translateTime: 'SYS:standard' },
          },
        }
      : {}),
    redact: {
      paths: ['req.headers.authorization', 'req.headers.cookie', 'password', 'passwordHash'],
      remove: true,
    },
  }) as unknown as FastifyBaseLogger;
}
