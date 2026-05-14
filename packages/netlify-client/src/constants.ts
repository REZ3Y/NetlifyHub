import { NETLIFY_DEFAULT_RATE_LIMIT_RPM } from '@netlifyhub/shared';

/** Official REST base (`host` + `basePath` from Netlify OpenAPI). */
export const NETLIFY_API_BASE_URL = 'https://api.netlify.com/api/v1';

/** OpenAPI / interactive docs (Swagger 2). */
export const NETLIFY_OPEN_API_URL = 'https://open-api.netlify.com/';

/** Human-readable API guide (authentication, rate limits, examples). */
export const NETLIFY_API_DOCS_URL =
  'https://docs.netlify.com/api-and-cli-guides/api-guides/get-started-with-api/';

export const NETLIFY_CLIENT_DEFAULTS = {
  documentedRateLimitRpm: NETLIFY_DEFAULT_RATE_LIMIT_RPM,
  maxRetries: 4,
  initialRetryMs: 500,
  maxRetryMs: 15_000,
  timeoutMs: 120_000,
  userAgent: 'NetlifyHub/0.1 (+https://github.com/REZ3Y/NetlifyHub)',
} as const;
