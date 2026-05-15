import { prisma } from '../db/prisma.js';
import { createNetlifyClient } from '../integrations/netlify/index.js';
import { NetlifyApiError } from '@netlifyhub/netlify-client';
import { createNetlifyFetchForUser } from '../lib/netlify-proxied-fetch.js';
import { encryptSecret } from '../lib/token-crypto.js';
import { invalidateLinkedNetlifyAccountSitesCache } from './netlify-account-sites.service.js';
import { invalidateLinkedNetlifyAccountUsageCache } from './netlify-account-usage.service.js';
import type { Env } from '../config/env.js';
import { z } from 'zod';

/** Netlify may return snake_case or camelCase; some fields are explicit `null`. */
function normalizeNetlifyUserJson(raw: unknown): unknown {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) return raw;
  const o = { ...(raw as Record<string, unknown>) };
  const aliases: [string, string][] = [
    ['fullName', 'full_name'],
    ['avatarUrl', 'avatar_url'],
    ['siteCount', 'site_count'],
    ['createdAt', 'created_at'],
    ['lastLogin', 'last_login'],
    ['affiliateId', 'affiliate_id'],
  ];
  for (const [camel, snake] of aliases) {
    if (camel in o && !(snake in o)) {
      o[snake] = o[camel];
      delete o[camel];
    }
  }
  return o;
}

const stringOrIsoFromNumber = z
  .union([z.string(), z.number(), z.null()])
  .optional()
  .transform((v) => {
    if (v === undefined || v === null) return undefined;
    if (typeof v === 'number') {
      const d = new Date(v);
      return Number.isNaN(d.getTime()) ? String(v) : d.toISOString();
    }
    return v;
  });

const netlifyUserBody = z
  .object({
    id: z.union([z.string(), z.number(), z.bigint()]).transform((v) => String(v)),
    uid: z
      .union([z.string(), z.number()])
      .nullish()
      .transform((v) => (v == null ? undefined : String(v))),
    full_name: z.string().nullish(),
    avatar_url: z.string().nullish(),
    email: z.string().nullish(),
    affiliate_id: z.union([z.string(), z.number(), z.boolean(), z.null()]).optional(),
    site_count: z.coerce.number().int().nullish(),
    created_at: stringOrIsoFromNumber,
    last_login: stringOrIsoFromNumber,
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
  enabled: boolean;
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
  enabled: boolean;
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
    enabled: row.enabled,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

const accountSelect = {
  id: true,
  label: true,
  netlifyId: true,
  uid: true,
  fullName: true,
  avatarUrl: true,
  email: true,
  affiliateId: true,
  siteCount: true,
  netlifyCreatedAt: true,
  netlifyLastLogin: true,
  enabled: true,
  createdAt: true,
  updatedAt: true,
} as const;

export async function listLinkedNetlifyAccountsPaged(
  userId: string,
  opts: { page: number; pageSize: number }
): Promise<{ accounts: LinkedNetlifyAccountDto[]; total: number }> {
  const skip = (opts.page - 1) * opts.pageSize;
  const [rows, total] = await Promise.all([
    prisma.netlifyLinkedAccount.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      skip,
      take: opts.pageSize,
      select: accountSelect,
    }),
    prisma.netlifyLinkedAccount.count({ where: { userId } }),
  ]);
  return { accounts: rows.map(toDto), total };
}

export async function getLinkedNetlifyAccount(
  userId: string,
  id: string
): Promise<LinkedNetlifyAccountDto | null> {
  const row = await prisma.netlifyLinkedAccount.findFirst({
    where: { id, userId },
    select: accountSelect,
  });
  return row ? toDto(row) : null;
}

export async function deleteLinkedNetlifyAccount(userId: string, id: string): Promise<boolean> {
  const res = await prisma.netlifyLinkedAccount.deleteMany({ where: { id, userId } });
  return res.count > 0;
}

export async function setLinkedNetlifyAccountEnabled(
  userId: string,
  id: string,
  enabled: boolean
): Promise<LinkedNetlifyAccountDto | null> {
  try {
    const row = await prisma.netlifyLinkedAccount.update({
      where: { id, userId },
      data: { enabled },
      select: accountSelect,
    });
    return toDto(row);
  } catch {
    return null;
  }
}

export async function updateLinkedNetlifyAccount(
  env: Env,
  userId: string,
  id: string,
  input: { label?: string | null; apiToken?: string }
): Promise<
  | { ok: true; account: LinkedNetlifyAccountDto }
  | { ok: false; error: string; message: string; status: number }
> {
  const existing = await prisma.netlifyLinkedAccount.findFirst({
    where: { id, userId },
    select: { id: true },
  });
  if (!existing) {
    return { ok: false, error: 'NOT_FOUND', message: 'Linked account not found.', status: 404 };
  }

  const secret = env.TOKEN_ENCRYPTION_KEY;
  if (input.apiToken !== undefined && (!secret || secret.length < 32)) {
    return {
      ok: false,
      error: 'SERVER_MISCONFIGURED',
      message: 'TOKEN_ENCRYPTION_KEY must be set (32+ characters) to store Netlify tokens.',
      status: 503,
    };
  }

  if (input.apiToken === undefined) {
    const row = await prisma.netlifyLinkedAccount.update({
      where: { id, userId },
      data: { label: input.label?.trim() ? input.label.trim() : null },
      select: accountSelect,
    });
    return { ok: true, account: toDto(row) };
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

  const parsed = netlifyUserBody.safeParse(normalizeNetlifyUserJson(raw));
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
  const tokenEncrypted = encryptSecret(input.apiToken, secret!);

  try {
    const row = await prisma.netlifyLinkedAccount.update({
      where: { id, userId },
      data: {
        label:
          input.label !== undefined ? (input.label?.trim() ? input.label.trim() : null) : undefined,
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
      select: accountSelect,
    });
    invalidateLinkedNetlifyAccountUsageCache(userId, id);
    invalidateLinkedNetlifyAccountSitesCache(userId, id);
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

  const parsed = netlifyUserBody.safeParse(normalizeNetlifyUserJson(raw));
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
