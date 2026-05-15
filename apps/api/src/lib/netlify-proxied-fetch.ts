import type { Env } from '../config/env.js';
import { createOutboundFetchForUser } from './outbound-proxied-fetch.js';

/** @deprecated Use `createOutboundFetchForUser` — kept for Netlify call sites. */
export async function createNetlifyFetchForUser(env: Env, userId: string): Promise<typeof fetch> {
  return createOutboundFetchForUser(env, userId);
}
