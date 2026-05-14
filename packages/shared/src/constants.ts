/** API version prefix used by Fastify routes and the web app proxy. */
export const API_PREFIX = '/v1';

/** HTTP-only cookie holding opaque session id (server stores hash in DB). */
export const SESSION_COOKIE_NAME = 'netlifyhub_session';

/** Default Netlify API rate limit (requests per minute) per official docs. */
export const NETLIFY_DEFAULT_RATE_LIMIT_RPM = 500;

export type UserRole = 'ADMIN' | 'OPERATOR' | 'VIEWER';
