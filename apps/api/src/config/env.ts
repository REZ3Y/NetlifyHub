import { z } from 'zod';

const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
    PORT: z.coerce.number().int().positive().default(3000),
    HOST: z.string().default('0.0.0.0'),
    DATABASE_URL: z.string().min(1),
    REDIS_URL: z.string().min(1),
    SESSION_TTL_DAYS: z.coerce.number().int().positive().max(90).default(7),
    WEB_ORIGIN: z
      .string()
      .min(1)
      .refine((s) => s.startsWith('http://') || s.startsWith('https://'), 'Must be absolute URL'),
    COOKIE_SECURE: z.enum(['true', 'false']).optional(),
    BCRYPT_ROUNDS: z.coerce.number().int().min(10).max(14).default(12),
    TOKEN_ENCRYPTION_KEY: z.string().min(32).optional(),
    LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
    /** Absolute or cwd-relative path to Vite `dist` (Docker). When set, SPA is served from this API. */
    STATIC_WEB_ROOT: z.string().optional(),
  })
  .transform((v) => {
    let cookieSecure: boolean;
    if (v.COOKIE_SECURE === 'true') cookieSecure = true;
    else if (v.COOKIE_SECURE === 'false') cookieSecure = false;
    else cookieSecure = v.NODE_ENV === 'production';
    const { COOKIE_SECURE: _raw, ...rest } = v;
    void _raw;
    const staticRoot =
      typeof rest.STATIC_WEB_ROOT === 'string' && rest.STATIC_WEB_ROOT.trim() !== ''
        ? rest.STATIC_WEB_ROOT.trim()
        : undefined;
    return { ...rest, COOKIE_SECURE: cookieSecure, STATIC_WEB_ROOT: staticRoot };
  });

export type Env = z.output<typeof envSchema>;

export function loadEnv(): Env {
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    console.error('Invalid environment variables:', parsed.error.flatten().fieldErrors);
    process.exit(1);
  }
  return parsed.data;
}
