import { prisma } from '../db/prisma.js';
import { createNetlifyClient } from '../integrations/netlify/index.js';
import { NetlifyApiError } from '@netlifyhub/netlify-client';
import { createNetlifyFetchForUser } from '../lib/netlify-proxied-fetch.js';
import { encryptSecret } from '../lib/token-crypto.js';
import type { Env } from '../config/env.js';
import { z } from 'zod';

const netlifyUserBody = z
  .object({
    id: z.union([z.string(), z.number()]).transform((v) => String(v)),
    uid: z.string().optional(),
    full_name: z.string().optional(),
    avatar_url: z.string().optional(),
    email: z.string().optional(),
    affiliate_id: z.union([z.string(), z.number(), z.null()]).optional(),
    site_count: z.coerce.number().int().optional(),
    created_at: z.string().optional(),
    last_login: z.union([z.string(), z.null()]).optional(),
  })
  .passthrough();

export type LinkedNetlifyAccountDto = {
  id: string;
  label: string | null;
  netlifyId: string;
  uid: string;
  fullName: string | null;
  avatarUrl: string | null;
  email: string | null;
  affiliateId: string | null;
  siteCount: number;
  netlifyCreatedAt: string | null;
  netlifyLastLogin: string | null;
  createdAt: string;
  updatedAt: string;
};

function toDto(row: {
  id: string;
  label: string | null;
  netlifyId: string;
  uid: string;
  fullName: string | null;
  avatarUrl: string | null;
  email: string | null;
  affiliateId: string | null;
  siteCount: number;
  netlifyCreatedAt: string | null;
  netlifyLastLogin: string | null;
  createdAt: Date;
  updatedAt: Date;
}): LinkedNetlifyAccountDto {
  return {
    id: row.id,
    label: row.label,
    netlifyId: row.netlifyId,
    uid: row.uid,
    fullName: row.fullName,
    avatarUrl: row.avatarUrl,
    email: row.email,
    affiliateId: row.affiliateId,
    siteCount: row.siteCount,
    netlifyCreatedAt: row.netlifyCreatedAt,
    netlifyLastLogin: row.netlifyLastLogin,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function createLinkedNetlifyAccount(
  env: Env,
  userId: string,
  input: { label?: string | null; apiToken: string }
): Promise<
  | { ok: true; account: LinkedNetlifyAccountDto }
  | { ok: false; error: string; message: string; status: number }
> {
  const secret = env.TOKEN_ENCRYPTION_KEY;
  if (!secret || secret.length < 32) {
    return {
      ok: false,
      error: 'SERVER_MISCONFIGURED',
      message: 'TOKEN_ENCRYPTION_KEY must be set (32+ characters) to store Netlify tokens.',
      status: 503,
    };
  }

  const fetchImpl = await createNetlifyFetchForUser(env, userId);
  const client = createNetlifyClient({ accessToken: input.apiToken, fetchImpl });
  let raw: unknown;
  try {
    raw = await client.user.get();
  } catch (e) {
    if (e instanceof NetlifyApiError) {
      const msg =
        e.status === 401
          ? 'Invalid or expired Netlify API token.'
          : e.message || 'Netlify API request failed.';
      return {
        ok: false,
        error: 'NETLIFY_API_ERROR',
        message: msg,
        status: e.status >= 400 && e.status < 600 ? e.status : 502,
      };
    }
    return {
      ok: false,
      error: 'NETLIFY_API_ERROR',
      message: 'Unexpected error while calling Netlify.',
      status: 502,
    };
  }

  const parsed = netlifyUserBody.safeParse(raw);
  if (!parsed.success) {
    return {
      ok: false,
      error: 'INVALID_NETLIFY_RESPONSE',
      message: 'Unexpected user payload from Netlify.',
      status: 502,
    };
  }
  const u = parsed.data;
  const affiliateId =
    u.affiliate_id === undefined || u.affiliate_id === null ? null : String(u.affiliate_id);

  const tokenEncrypted = encryptSecret(input.apiToken, secret);

  try {
    const row = await prisma.netlifyLinkedAccount.create({
      data: {
        userId,
        label: input.label?.trim() ? input.label.trim() : null,
        netlifyId: u.id,
        uid: u.uid ?? u.id,
        fullName: u.full_name ?? null,
        avatarUrl: u.avatar_url ?? null,
        email: u.email ?? null,
        affiliateId,
        siteCount: u.site_count ?? 0,
        netlifyCreatedAt: u.created_at ?? null,
        netlifyLastLogin: u.last_login === null || u.last_login === undefined ? null : u.last_login,
        tokenEncrypted,
      },
    });
    return { ok: true, account: toDto(row) };
  } catch (e: unknown) {
    const code =
      typeof e === 'object' &&
      e !== null &&
      'code' in e &&
      typeof (e as { code: unknown }).code === 'string'
        ? (e as { code: string }).code
        : undefined;
    if (code === 'P2002') {
      return {
        ok: false,
        error: 'DUPLICATE_ACCOUNT',
        message: 'This Netlify account is already linked to your profile.',
        status: 409,
      };
    }
    throw e;
  }
}
