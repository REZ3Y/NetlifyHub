import type { NetlifyEnvVar } from '@netlifyhub/netlify-client';
import { NetlifyApiError } from '@netlifyhub/netlify-client';
import type { NetlifyClient } from '../integrations/netlify/index.js';
import type { Env } from '../config/env.js';
import { createNetlifyClientForLinkedAccount } from '../lib/netlify-linked-client.js';

export type SiteEnvVarDto = {
  key: string;
  isSecret: boolean;
  scopes: string[];
  values: Array<{
    id: string | null;
    context: string;
    contextParameter: string | null;
    /** Empty when `isSecret` and value is not exposed by Netlify. */
    value: string;
    hasValue: boolean;
  }>;
  updatedAt: string | null;
};

export type SiteEnvSaveResult = {
  envVars: SiteEnvVarDto[];
  redeploy: { triggered: boolean; buildId: string | null; error: string | null };
};

function mapEnvVar(raw: NetlifyEnvVar): SiteEnvVarDto {
  const values = (raw.values ?? []).map((v) => {
    const value = typeof v.value === 'string' ? v.value : '';
    return {
      id: typeof v.id === 'string' ? v.id : null,
      context: typeof v.context === 'string' ? v.context : 'all',
      contextParameter:
        typeof v.context_parameter === 'string' && v.context_parameter.trim()
          ? v.context_parameter
          : null,
      value,
      hasValue: value.length > 0 || !raw.is_secret,
    };
  });
  return {
    key: raw.key,
    isSecret: Boolean(raw.is_secret),
    scopes: Array.isArray(raw.scopes) ? raw.scopes.filter((s) => typeof s === 'string') : [],
    values,
    updatedAt: typeof raw.updated_at === 'string' ? raw.updated_at : null,
  };
}

async function resolveAccountIdForSite(client: NetlifyClient, siteId: string): Promise<string> {
  const site = await client.sites.get(siteId);
  const accountId =
    (typeof site.account_id === 'string' && site.account_id.trim()) ||
    (typeof site.account_slug === 'string' && site.account_slug.trim());
  if (accountId) return accountId;

  const teams = await client.accounts.list();
  const first = teams.data?.[0];
  const fallback =
    (typeof first?.id === 'string' && first.id) || (typeof first?.slug === 'string' && first.slug);
  if (!fallback) {
    throw new Error('Could not resolve Netlify account id for this site.');
  }
  return fallback;
}

function netlifyError(e: unknown): { error: string; message: string; status: number } {
  if (e instanceof NetlifyApiError) {
    return {
      error: 'NETLIFY_API_ERROR',
      message: e.message || 'Netlify API request failed.',
      status: e.status >= 400 && e.status < 600 ? e.status : 502,
    };
  }
  return {
    error: 'NETLIFY_ERROR',
    message: e instanceof Error ? e.message : 'Netlify request failed.',
    status: 502,
  };
}

export async function fetchLinkedNetlifySiteEnvVars(
  env: Env,
  userId: string,
  linkedAccountId: string,
  siteId: string
): Promise<
  | { ok: true; envVars: SiteEnvVarDto[] }
  | { ok: false; error: string; message: string; status: number }
> {
  const clientResult = await createNetlifyClientForLinkedAccount(env, userId, linkedAccountId);
  if (!clientResult.ok) return clientResult;

  try {
    const raw = await clientResult.client.envVars.listForSite(siteId);
    return { ok: true, envVars: raw.map(mapEnvVar) };
  } catch (e) {
    return { ok: false, ...netlifyError(e) };
  }
}

export type SaveSiteEnvInput = {
  key: string;
  value: string;
  context?: 'all' | 'production' | 'deploy-preview' | 'branch-deploy' | 'dev';
  isSecret?: boolean;
  /** When true, schedule `POST /sites/{id}/builds` after a successful save. */
  triggerRedeploy?: boolean;
};

export async function saveLinkedNetlifySiteEnvVar(
  env: Env,
  userId: string,
  linkedAccountId: string,
  siteId: string,
  input: SaveSiteEnvInput
): Promise<
  | { ok: true; result: SiteEnvSaveResult }
  | { ok: false; error: string; message: string; status: number }
> {
  const clientResult = await createNetlifyClientForLinkedAccount(env, userId, linkedAccountId);
  if (!clientResult.ok) return clientResult;

  const client = clientResult.client;
  const context = input.context ?? 'all';
  const key = input.key.trim();
  if (!key) {
    return { ok: false, error: 'VALIDATION_ERROR', message: 'Key is required.', status: 400 };
  }

  try {
    const accountId = await resolveAccountIdForSite(client, siteId);
    const existing = await client.envVars.listForSite(siteId);
    const found = existing.find((v) => v.key === key);

    if (found) {
      await client.envVars.setValueForSite(accountId, siteId, key, {
        value: input.value,
        context,
      });
    } else {
      await client.envVars.createForSite(accountId, siteId, [
        {
          key,
          is_secret: input.isSecret ?? false,
          values: [{ value: input.value, context }],
        },
      ]);
    }

    const envVars = (await client.envVars.listForSite(siteId)).map(mapEnvVar);

    let redeploy: SiteEnvSaveResult['redeploy'] = {
      triggered: false,
      buildId: null,
      error: null,
    };

    if (input.triggerRedeploy !== false) {
      try {
        const build = await client.builds.triggerForSite(siteId, {
          title: 'Env variables updated via NetlifyHub',
        });
        redeploy = {
          triggered: true,
          buildId: typeof build.id === 'string' ? build.id : null,
          error: null,
        };
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'Could not trigger build.';
        redeploy = { triggered: false, buildId: null, error: msg };
      }
    }

    return { ok: true, result: { envVars, redeploy } };
  } catch (e) {
    return { ok: false, ...netlifyError(e) };
  }
}
