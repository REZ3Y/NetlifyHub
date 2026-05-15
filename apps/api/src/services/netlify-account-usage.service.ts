import type { NetlifyAccount, NetlifyCapabilityQuota } from '@netlifyhub/netlify-client';
import { NetlifyApiError } from '@netlifyhub/netlify-client';
import type { Env } from '../config/env.js';
import { prisma } from '../db/prisma.js';
import { createNetlifyClientForLinkedAccount } from '../lib/netlify-linked-client.js';

const GIB = 1024 ** 3;
import { getNetlifyCacheTtlMs } from './panel-settings.service.js';

type UsageCacheEntry = {
  usage: NetlifyAccountUsageDto;
  expiresAt: number;
};

const usageCache = new Map<string, UsageCacheEntry>();

function usageCacheKey(userId: string, linkedAccountId: string): string {
  return `${userId}:${linkedAccountId}`;
}

export function invalidateLinkedNetlifyAccountUsageCache(
  userId: string,
  linkedAccountId: string
): void {
  usageCache.delete(usageCacheKey(userId, linkedAccountId));
}

export type NetlifyAccountUsageDto = {
  teamName: string;
  teamSlug: string;
  planName: string | null;
  billingPeriod: { start: string; end: string } | null;
  bandwidth: { used: number; included: number; usedLabel: string; includedLabel: string } | null;
  credits: {
    used: number;
    included: number;
    remaining: number;
    usedLabel: string;
    remainingLabel: string;
    includedLabel: string;
  } | null;
  buildMinutes: {
    used: number;
    included: number;
    usedLabel: string;
    includedLabel: string;
  } | null;
  concurrentBuilds: { active: number; limit: number | null; label: string } | null;
  teamMembers: { count: number; limit: number | null; label: string } | null;
  otherTeams: { name: string; slug: string }[];
};

/** Compact usage row for the linked-accounts list. */
export type NetlifyAccountUsageSummaryDto = {
  planName: string | null;
  quotaLabel: string | null;
  quotaKind: 'bandwidth' | 'credits' | null;
  used: number | null;
  included: number | null;
};

function formatBytesLabel(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return '—';
  const gib = bytes / GIB;
  if (gib >= 1024) {
    const tib = gib / 1024;
    const n = tib >= 10 ? Math.round(tib) : Math.round(tib * 10) / 10;
    return `${n} TB`;
  }
  const n = gib >= 10 ? Math.round(gib) : Math.round(gib * 10) / 10;
  return `${n} GB`;
}

function formatMinutesLabel(minutes: number): string {
  if (!Number.isFinite(minutes) || minutes < 0) return '—';
  return Math.round(minutes).toLocaleString('en-US');
}

function formatCreditsLabel(credits: number): string {
  if (!Number.isFinite(credits) || credits < 0) return '—';
  return Math.round(credits).toLocaleString('en-US');
}

function isCreditFreePlan(account: NetlifyAccount): boolean {
  const slug = typeof account.type_slug === 'string' ? account.type_slug : '';
  const name = typeof account.type_name === 'string' ? account.type_name : '';
  return slug === 'credit-free' || name === 'Free';
}

function pickBillingPeriodFromAccount(
  account: NetlifyAccount
): { start: string; end: string } | null {
  const start =
    (typeof account.current_usage_period_start === 'string' &&
      account.current_usage_period_start) ||
    (typeof account.current_billing_period_start === 'string' &&
      account.current_billing_period_start);
  const end =
    (typeof account.next_usage_period_start === 'string' && account.next_usage_period_start) ||
    (typeof account.next_billing_period_start === 'string' && account.next_billing_period_start);
  if (!start || !end) return null;
  return { start, end };
}

function readCreditsUsage(account: NetlifyAccount): {
  used: number;
  included: number;
  remaining: number;
  usedLabel: string;
  remainingLabel: string;
  includedLabel: string;
} | null {
  const cap = readCapability(account.capabilities, ['credits']);
  const included =
    (typeof cap?.included === 'number' ? cap.included : null) ??
    parseNumeric(account.plan_credits as number | undefined);
  const used = typeof cap?.used === 'number' ? cap.used : 0;
  if (included == null || !Number.isFinite(included)) return null;
  const remaining = Math.max(0, included - used);
  return {
    used,
    included,
    remaining,
    usedLabel: formatCreditsLabel(used),
    remainingLabel: formatCreditsLabel(remaining),
    includedLabel: formatCreditsLabel(included),
  };
}

function parseNumeric(value: string | number | undefined): number | null {
  if (value === undefined || value === null) return null;
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}

function readCapability(
  capabilities: NetlifyAccount['capabilities'],
  keys: string[]
): NetlifyCapabilityQuota | null {
  if (!capabilities || typeof capabilities !== 'object') return null;
  const map = capabilities as Record<string, unknown>;
  for (const key of keys) {
    const raw = map[key];
    if (!raw || typeof raw !== 'object') continue;
    const o = raw as NetlifyCapabilityQuota;
    if (typeof o.included === 'number' || typeof o.used === 'number') return o;
  }
  return null;
}

function pickBillingPeriod(
  bandwidth: { period_start_date?: string; period_end_date?: string } | null,
  minutes: { period_start_date?: string; period_end_date?: string } | undefined
): { start: string; end: string } | null {
  const start = bandwidth?.period_start_date ?? minutes?.period_start_date;
  const end = bandwidth?.period_end_date ?? minutes?.period_end_date;
  if (!start || !end) return null;
  return { start, end };
}

export function getCachedLinkedNetlifyAccountUsage(
  userId: string,
  linkedAccountId: string
): NetlifyAccountUsageDto | null {
  const cached = usageCache.get(usageCacheKey(userId, linkedAccountId));
  if (cached && cached.expiresAt > Date.now()) return cached.usage;
  return null;
}

export function usageToSummary(usage: NetlifyAccountUsageDto): NetlifyAccountUsageSummaryDto {
  if (usage.credits) {
    return {
      planName: usage.planName,
      quotaKind: 'credits',
      used: usage.credits.used,
      included: usage.credits.included,
      quotaLabel: `${usage.credits.usedLabel} / ${usage.credits.includedLabel}`,
    };
  }
  if (usage.bandwidth) {
    return {
      planName: usage.planName,
      quotaKind: 'bandwidth',
      used: usage.bandwidth.used,
      included: usage.bandwidth.included,
      quotaLabel: `${usage.bandwidth.usedLabel} / ${usage.bandwidth.includedLabel}`,
    };
  }
  return {
    planName: usage.planName,
    quotaKind: null,
    quotaLabel: null,
    used: null,
    included: null,
  };
}

export async function fetchUsageSummariesForLinkedAccounts(
  env: Env,
  userId: string,
  accountIds: string[],
  options?: { refresh?: boolean }
): Promise<Record<string, NetlifyAccountUsageSummaryDto | null>> {
  const uniqueIds = [...new Set(accountIds.filter((id) => id.length > 0))];
  const result: Record<string, NetlifyAccountUsageSummaryDto | null> = {};
  if (!uniqueIds.length) return result;

  const rows = await prisma.netlifyLinkedAccount.findMany({
    where: { userId, id: { in: uniqueIds } },
    select: { id: true, enabled: true },
  });

  const rowById = new Map(rows.map((r) => [r.id, r]));
  for (const id of uniqueIds) {
    const row = rowById.get(id);
    if (!row || !row.enabled) {
      result[id] = null;
    }
  }

  const toFetch = rows.filter((r) => r.enabled).map((r) => r.id);
  await Promise.all(
    toFetch.map(async (linkedAccountId) => {
      if (!options?.refresh) {
        const cached = getCachedLinkedNetlifyAccountUsage(userId, linkedAccountId);
        if (cached) {
          result[linkedAccountId] = usageToSummary(cached);
          return;
        }
      }
      const fetched = await fetchLinkedNetlifyAccountUsage(env, userId, linkedAccountId, {
        refresh: options?.refresh,
      });
      result[linkedAccountId] = fetched.ok ? usageToSummary(fetched.usage) : null;
    })
  );

  return result;
}

export async function fetchLinkedNetlifyAccountUsage(
  env: Env,
  userId: string,
  linkedAccountId: string,
  options?: { refresh?: boolean }
): Promise<
  | { ok: true; usage: NetlifyAccountUsageDto }
  | { ok: false; error: string; message: string; status: number }
> {
  const cacheKey = usageCacheKey(userId, linkedAccountId);
  if (options?.refresh) {
    usageCache.delete(cacheKey);
  }

  const cached = usageCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return { ok: true, usage: cached.usage };
  }

  const clientResult = await createNetlifyClientForLinkedAccount(env, userId, linkedAccountId);
  if (!clientResult.ok) return clientResult;

  const client = clientResult.client;
  let teams: NetlifyAccount[];
  try {
    const listed = await client.accounts.list();
    teams = listed.data ?? [];
  } catch (e) {
    if (e instanceof NetlifyApiError) {
      return {
        ok: false,
        error: 'NETLIFY_API_ERROR',
        message: e.message || 'Netlify API request failed.',
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

  if (!teams.length) {
    return {
      ok: false,
      error: 'NO_TEAMS',
      message: 'No Netlify team accounts are visible for this token.',
      status: 404,
    };
  }

  const team = teams[0]!;
  const accountId = team.id;
  const slug = team.slug;
  if (!accountId || !slug) {
    return {
      ok: false,
      error: 'INVALID_NETLIFY_RESPONSE',
      message: 'Team account is missing id or slug.',
      status: 502,
    };
  }

  let bandwidth: Awaited<ReturnType<typeof client.accounts.getBandwidth>> | null = null;
  let buildRows: Awaited<ReturnType<typeof client.accounts.getBuildStatus>> = [];
  let accountDetail: NetlifyAccount = team;

  try {
    const [bw, buildStatus, detail] = await Promise.all([
      client.accounts.getBandwidth(slug).catch(() => null),
      client.accounts.getBuildStatus(accountId),
      client.accounts.get(accountId),
    ]);
    bandwidth = bw;
    buildRows = buildStatus;
    accountDetail = detail;
  } catch (e) {
    if (e instanceof NetlifyApiError) {
      return {
        ok: false,
        error: 'NETLIFY_API_ERROR',
        message: e.message || 'Netlify API request failed.',
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

  const build = buildRows[0];
  const minutes = build?.minutes;
  const includedMinutes =
    parseNumeric(minutes?.included_minutes_with_packs) ??
    parseNumeric(minutes?.included_minutes) ??
    0;
  const usedMinutes = minutes?.current ?? 0;

  const collaborators = readCapability(accountDetail.capabilities, ['collaborators']);
  const concurrentCap = readCapability(accountDetail.capabilities, [
    'concurrent_builds',
    'builds',
    'build',
  ]);

  const activeBuilds = build?.active ?? 0;

  const memberCount = collaborators?.used ?? null;
  const memberLimit = collaborators?.included ?? null;

  const creditFree = isCreditFreePlan(accountDetail);
  const credits = creditFree ? readCreditsUsage(accountDetail) : null;
  const bandwidthFromApi =
    bandwidth && typeof bandwidth.used === 'number' && typeof bandwidth.included === 'number'
      ? {
          used: bandwidth.used,
          included: bandwidth.included,
          usedLabel: formatBytesLabel(bandwidth.used),
          includedLabel: formatBytesLabel(bandwidth.included),
        }
      : null;

  const usage: NetlifyAccountUsageDto = {
    teamName: accountDetail.name ?? team.name ?? slug,
    teamSlug: slug,
    planName: accountDetail.type_name ?? null,
    billingPeriod:
      pickBillingPeriod(bandwidth, minutes) ?? pickBillingPeriodFromAccount(accountDetail),
    bandwidth: creditFree ? null : bandwidthFromApi,
    credits: creditFree ? credits : null,
    buildMinutes: {
      used: usedMinutes,
      included: includedMinutes,
      usedLabel: formatMinutesLabel(usedMinutes),
      includedLabel: formatMinutesLabel(includedMinutes),
    },
    concurrentBuilds: {
      active: activeBuilds,
      limit: concurrentCap?.included ?? null,
      label:
        concurrentCap?.included != null
          ? `${activeBuilds} / ${concurrentCap.included}`
          : String(activeBuilds),
    },
    teamMembers: {
      count: memberCount ?? 0,
      limit: memberLimit,
      label:
        memberLimit != null && memberCount != null
          ? memberLimit > 0
            ? `${memberCount} / ${memberLimit}`
            : String(memberCount)
          : memberCount != null
            ? String(memberCount)
            : '—',
    },
    otherTeams: teams.slice(1).map((t) => ({
      name: t.name ?? t.slug ?? t.id ?? 'Team',
      slug: t.slug ?? '',
    })),
  };

  const ttlMs = await getNetlifyCacheTtlMs();
  usageCache.set(cacheKey, {
    usage,
    expiresAt: Date.now() + ttlMs,
  });

  return { ok: true, usage };
}
