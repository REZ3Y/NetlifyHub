import { createNetlifyClient, type NetlifyClient } from '../integrations/netlify/index.js';
import { prisma } from '../db/prisma.js';
import type { Env } from '../config/env.js';
import { decryptSecret } from './token-crypto.js';
import { createNetlifyFetchForUser } from './netlify-proxied-fetch.js';

export async function createNetlifyClientForLinkedAccount(
  env: Env,
  userId: string,
  linkedAccountId: string
): Promise<
  | { ok: true; client: NetlifyClient }
  | { ok: false; error: string; message: string; status: number }
> {
  const row = await prisma.netlifyLinkedAccount.findFirst({
    where: { id: linkedAccountId, userId },
    select: { enabled: true, tokenEncrypted: true },
  });
  if (!row) {
    return {
      ok: false,
      error: 'NOT_FOUND',
      message: 'Linked account not found.',
      status: 404,
    };
  }
  if (!row.enabled) {
    return {
      ok: false,
      error: 'ACCOUNT_DISABLED',
      message: 'This linked account is disabled in the panel.',
      status: 403,
    };
  }

  const secret = env.TOKEN_ENCRYPTION_KEY;
  if (!secret || secret.length < 32) {
    return {
      ok: false,
      error: 'SERVER_MISCONFIGURED',
      message: 'TOKEN_ENCRYPTION_KEY must be set (32+ characters) to use Netlify tokens.',
      status: 503,
    };
  }

  const accessToken = decryptSecret(row.tokenEncrypted, secret);
  const fetchImpl = await createNetlifyFetchForUser(env, userId);
  return {
    ok: true,
    client: createNetlifyClient({ accessToken, fetchImpl }),
  };
}
