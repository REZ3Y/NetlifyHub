import type { NetlifySite } from '@netlifyhub/netlify-client';
import { NetlifyApiError } from '@netlifyhub/netlify-client';
import { parseNextUrlFromLinkHeader } from '@netlifyhub/netlify-client';
import type { FastifyReply } from 'fastify';
import type { Env } from '../config/env.js';
import { getNetlifyCacheTtlMs } from './panel-settings.service.js';
import type { NetlifyClient } from '../integrations/netlify/index.js';
import { createNetlifyFetchForUser } from '../lib/netlify-proxied-fetch.js';
import { createNetlifyClientForLinkedAccount } from '../lib/netlify-linked-client.js';
import { SITE_THUMB_PLACEHOLDER_SVG } from '../lib/site-thumb-placeholder.js';
import { attachPanelNotesToSites } from './netlify-linked-site-note.service.js';

type SitesCacheEntry = {
  sites: NetlifyLinkedSiteDto[];
  teamName: string;
  expiresAt: number;
};

const sitesCache = new Map<string, SitesCacheEntry>();

function sitesCacheKey(userId: string, linkedAccountId: string): string {
  return `${userId}:${linkedAccountId}`;
}

export function invalidateLinkedNetlifyAccountSitesCache(
  userId: string,
  linkedAccountId: string
): void {
  sitesCache.delete(sitesCacheKey(userId, linkedAccountId));
}

export type NetlifyLinkedSiteDto = {
  id: string;
  name: string;
  displayDomain: string | null;
  /** Hostname for clipboard (no protocol), from production deploy or site URL. */
  copyDomain: string | null;
  deploySource: string;
  ownerName: string | null;
  publishedAt: string | null;
  adminUrl: string | null;
  sslUrl: string | null;
  hasThumbnail: boolean;
  /** User-defined note in this panel (not from Netlify). */
  panelNote: string | null;
};

function stripProtocol(value: string): string {
  return value.replace(/^https?:\/\//i, '').replace(/\/+$/, '');
}

function pickCopyDomain(site: NetlifySite): string | null {
  const deploy = asRecord(site.published_deploy);
  if (deploy && deploy.context === 'production') {
    const fromDeploy =
      (typeof deploy.default_domain === 'string' && deploy.default_domain.trim()) ||
      (typeof deploy.ssl_url === 'string' && deploy.ssl_url.trim()) ||
      (typeof deploy.url === 'string' && deploy.url.trim());
    if (fromDeploy) return stripProtocol(fromDeploy);
  }
  const fallback =
    (typeof site.custom_domain === 'string' && site.custom_domain.trim()) ||
    (typeof site.ssl_url === 'string' && site.ssl_url.trim()) ||
    (typeof site.url === 'string' && site.url.trim()) ||
    null;
  return fallback ? stripProtocol(fallback) : null;
}

function asRecord(v: unknown): Record<string, unknown> | null {
  return v !== null && typeof v === 'object' && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : null;
}

function pickScreenshotUrl(site: NetlifySite): string | null {
  const direct =
    typeof site.screenshot_url === 'string' && site.screenshot_url.trim()
      ? site.screenshot_url.trim()
      : null;
  if (direct) return direct;
  const deploy = asRecord(site.published_deploy);
  const fromDeploy =
    typeof deploy?.screenshot_url === 'string' && deploy.screenshot_url.trim()
      ? deploy.screenshot_url.trim()
      : null;
  return fromDeploy;
}

function deploySourceLabel(site: NetlifySite): string {
  const build = asRecord(site.build_settings);
  const repo =
    (typeof build?.repo_url === 'string' && build.repo_url) ||
    (typeof build?.repoUrl === 'string' && build.repoUrl) ||
    '';
  if (repo) {
    if (/github\.com/i.test(repo)) return 'Deploys from GitHub';
    if (/gitlab/i.test(repo)) return 'Deploys from GitLab';
    if (/bitbucket/i.test(repo)) return 'Deploys from Bitbucket';
    return 'Deploys from Git';
  }
  const hook = asRecord(site.deploy_hook);
  if (hook) return 'Deployed via deploy hook';
  return 'Last deployed from Netlify Drop';
}

function mapSite(site: NetlifySite, teamName: string): NetlifyLinkedSiteDto {
  const id = typeof site.id === 'string' ? site.id : '';
  const name = typeof site.name === 'string' ? site.name : id;
  const customDomain =
    typeof site.custom_domain === 'string' && site.custom_domain.trim()
      ? site.custom_domain.trim()
      : null;
  const sslUrl =
    typeof site.ssl_url === 'string' && site.ssl_url.trim() ? site.ssl_url.trim() : null;
  const url = typeof site.url === 'string' && site.url.trim() ? site.url.trim() : null;
  const deploy = asRecord(site.published_deploy);
  const publishedAt =
    (typeof deploy?.published_at === 'string' && deploy.published_at) ||
    (typeof deploy?.updated_at === 'string' && deploy.updated_at) ||
    (typeof site.updated_at === 'string' && site.updated_at) ||
    null;
  const accountName =
    typeof site.account_name === 'string' && site.account_name.trim()
      ? site.account_name.trim()
      : teamName;

  return {
    id,
    name,
    displayDomain: customDomain ?? sslUrl ?? url,
    copyDomain: pickCopyDomain(site),
    deploySource: deploySourceLabel(site),
    ownerName: accountName || null,
    publishedAt,
    adminUrl:
      typeof site.admin_url === 'string' && site.admin_url.trim() ? site.admin_url.trim() : null,
    sslUrl,
    hasThumbnail: !!pickScreenshotUrl(site),
    panelNote: null,
  };
}

async function listAllSitesPaginated(
  fetchPage: (page: number) => Promise<{ data: NetlifySite[] | undefined; link: string | null }>
): Promise<NetlifySite[]> {
  const all: NetlifySite[] = [];
  let page = 1;
  for (;;) {
    const { data, link } = await fetchPage(page);
    if (Array.isArray(data)) all.push(...data);
    const next = parseNextUrlFromLinkHeader(link);
    if (!next || !data?.length) break;
    page += 1;
    if (page > 50) break;
  }
  return all;
}

/** Prefer `GET /sites` (matches Netlify dashboard); fall back to `GET /{account_slug}/sites`. */
async function listAllSitesForTeam(
  client: NetlifyClient,
  accountSlug: string | undefined
): Promise<NetlifySite[]> {
  try {
    const fromGlobal = await listAllSitesPaginated((page) =>
      client.sites.list({ page, per_page: 100 })
    );
    if (fromGlobal.length > 0) {
      if (!accountSlug) return fromGlobal;
      const filtered = fromGlobal.filter(
        (s) =>
          (typeof s.account_slug === 'string' && s.account_slug === accountSlug) ||
          (typeof s.account_id === 'string' && s.account_id === accountSlug)
      );
      return filtered.length > 0 ? filtered : fromGlobal;
    }
  } catch (e) {
    if (!(e instanceof NetlifyApiError)) throw e;
  }

  if (!accountSlug) return [];

  return listAllSitesPaginated((page) =>
    client.sites.listForAccount(accountSlug, { page, per_page: 100 })
  );
}

export async function fetchLinkedNetlifyAccountSites(
  env: Env,
  userId: string,
  linkedAccountId: string,
  options?: { refresh?: boolean }
): Promise<
  | { ok: true; teamName: string; sites: NetlifyLinkedSiteDto[] }
  | { ok: false; error: string; message: string; status: number }
> {
  const cacheKey = sitesCacheKey(userId, linkedAccountId);
  if (options?.refresh) {
    sitesCache.delete(cacheKey);
  }

  const cached = sitesCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    const sites = await attachPanelNotesToSites(linkedAccountId, cached.sites);
    return { ok: true, teamName: cached.teamName, sites };
  }

  const clientResult = await createNetlifyClientForLinkedAccount(env, userId, linkedAccountId);
  if (!clientResult.ok) return clientResult;

  const client = clientResult.client;

  let accountSlug: string | undefined;
  let teamName = 'Team';
  try {
    const listed = await client.accounts.list();
    const team = listed.data?.[0];
    if (team) {
      teamName = team.name ?? team.slug ?? teamName;
      accountSlug =
        (typeof team.slug === 'string' && team.slug.trim()) ||
        (typeof team.id === 'string' && team.id.trim()) ||
        undefined;
    }
  } catch {
    /* optional — sites can still load via GET /sites */
  }

  try {
    const rawSites = await listAllSitesForTeam(client, accountSlug);
    if (rawSites.length > 0) {
      const fromSite =
        typeof rawSites[0]?.account_name === 'string' && rawSites[0].account_name.trim()
          ? rawSites[0].account_name.trim()
          : null;
      if (fromSite && teamName === 'Team') teamName = fromSite;
    }
    const sites = rawSites
      .map((s) => mapSite(s, teamName))
      .filter((s) => s.id)
      .sort((a, b) => {
        const ta = a.publishedAt ? Date.parse(a.publishedAt) : 0;
        const tb = b.publishedAt ? Date.parse(b.publishedAt) : 0;
        if (tb !== ta) return tb - ta;
        return a.name.localeCompare(b.name);
      });

    const ttlMs = await getNetlifyCacheTtlMs();
    sitesCache.set(cacheKey, {
      sites,
      teamName,
      expiresAt: Date.now() + ttlMs,
    });

    const sitesWithNotes = await attachPanelNotesToSites(linkedAccountId, sites);
    return { ok: true, teamName, sites: sitesWithNotes };
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
}

export async function streamLinkedNetlifySiteThumbnail(
  env: Env,
  userId: string,
  linkedAccountId: string,
  siteId: string,
  reply: FastifyReply
): Promise<void> {
  const sendPlaceholder = () => {
    reply
      .header('Cache-Control', 'private, max-age=300')
      .type('image/svg+xml')
      .send(SITE_THUMB_PLACEHOLDER_SVG);
  };

  const clientResult = await createNetlifyClientForLinkedAccount(env, userId, linkedAccountId);
  if (!clientResult.ok) {
    sendPlaceholder();
    return;
  }

  let site: NetlifySite;
  try {
    site = await clientResult.client.sites.get(siteId);
  } catch {
    sendPlaceholder();
    return;
  }

  const imageUrl = pickScreenshotUrl(site);
  if (!imageUrl) {
    sendPlaceholder();
    return;
  }

  try {
    const fetchImpl = await createNetlifyFetchForUser(env, userId);
    const res = await fetchImpl(imageUrl);
    if (!res.ok) {
      sendPlaceholder();
      return;
    }
    const buf = Buffer.from(await res.arrayBuffer());
    const contentType = res.headers.get('content-type') ?? 'image/png';
    reply.header('Cache-Control', 'private, max-age=300').type(contentType).send(buf);
  } catch {
    sendPlaceholder();
  }
}
