import type { LoggerOptions } from 'pino';
import type { Env } from './env.js';

/** Pino options for Fastify 5 (`logger` must be a config object, not a logger instance). */
export function getPinoLoggerOptions(env: Env): LoggerOptions {
  return {
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
  };
}
