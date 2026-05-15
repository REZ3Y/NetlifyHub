import type {
  CreateEnvVarInput,
  NetlifyEnvVar,
  SetEnvVarValueInput,
  UpdateEnvVarInput,
} from '@netlifyhub/netlify-client';
import type { EnvVarContext } from '@netlifyhub/netlify-client';
import { NetlifyApiError } from '@netlifyhub/netlify-client';
import type { NetlifyClient } from '../integrations/netlify/index.js';
import type { Env } from '../config/env.js';
import { createNetlifyFetchForUser } from '../lib/netlify-proxied-fetch.js';
import { createNetlifyClientForLinkedAccount } from '../lib/netlify-linked-client.js';

export type SiteEnvVarDto = {
  key: string;
  isSecret: boolean;
  scopes: string[];
  values: Array<{
    id: string | null;
    context: string;
    contextParameter: string | null;
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
  const teams = await client.accounts.list();
  const list = teams.data ?? [];

  const slug = (typeof site.account_slug === 'string' && site.account_slug.trim()) || undefined;
  const id = (typeof site.account_id === 'string' && site.account_id.trim()) || undefined;

  for (const team of list) {
    const teamId = typeof team.id === 'string' ? team.id : undefined;
    const teamSlug = typeof team.slug === 'string' ? team.slug : undefined;
    if (slug && (teamSlug === slug || teamId === slug)) return teamId ?? teamSlug ?? slug;
    if (id && (teamId === id || teamSlug === id)) return teamId ?? teamSlug ?? id;
  }

  if (id) return id;
  if (slug) return slug;

  const first = list[0];
  const fallback =
    (typeof first?.id === 'string' && first.id) || (typeof first?.slug === 'string' && first.slug);
  if (!fallback) {
    throw new Error('Could not resolve Netlify account id for this site.');
  }
  return fallback;
}

function pickProductionBranch(site: Record<string, unknown>): string | undefined {
  const bs = site.build_settings;
  if (bs && typeof bs === 'object' && !Array.isArray(bs)) {
    const repo = (bs as Record<string, unknown>).repo;
    if (repo && typeof repo === 'object' && !Array.isArray(repo)) {
      const branch = (repo as Record<string, unknown>).default_branch;
      if (typeof branch === 'string' && branch.trim()) return branch.trim();
    }
  }
  const deploy = site.published_deploy;
  if (deploy && typeof deploy === 'object' && !Array.isArray(deploy)) {
    const branch = (deploy as Record<string, unknown>).branch;
    if (typeof branch === 'string' && branch.trim()) return branch.trim();
  }
  return undefined;
}

type EnvScope = NonNullable<CreateEnvVarInput['scopes']>[number];

function normalizeScopes(scopes: string[] | undefined): EnvScope[] | undefined {
  if (!scopes?.length) return undefined;
  const map: Record<string, EnvScope> = {
    builds: 'builds',
    functions: 'functions',
    runtime: 'runtime',
    'post-processing': 'post-processing',
    post_processing: 'post-processing',
  };
  const out = scopes.map((s) => map[s]).filter((s): s is EnvScope => Boolean(s));
  return out.length ? [...new Set(out)] : undefined;
}

function mergeEnvValues(
  existing: NetlifyEnvVar,
  context: EnvVarContext,
  newValue: string
): UpdateEnvVarInput['values'] {
  const values = [...(existing.values ?? [])];
  const idx = values.findIndex((v) => (v.context ?? 'all') === context);
  const entry = { value: newValue, context };
  if (idx >= 0) {
    values[idx] = { ...values[idx], ...entry };
  } else {
    values.push(entry);
  }
  return values.map((v) => {
    const ctx = (v.context ?? 'all') as EnvVarContext;
    const item: UpdateEnvVarInput['values'][number] = {
      value: typeof v.value === 'string' ? v.value : '',
      context: ctx,
    };
    if (typeof v.id === 'string' && v.id) item.id = v.id;
    if (typeof v.context_parameter === 'string' && v.context_parameter.trim()) {
      item.context_parameter = v.context_parameter.trim();
    }
    return item;
  });
}

async function updateExistingEnvVar(
  client: NetlifyClient,
  accountId: string,
  siteId: string,
  found: NetlifyEnvVar,
  key: string,
  context: EnvVarContext,
  value: string
): Promise<void> {
  const match = found.values?.find((v) => (v.context ?? 'all') === context) ?? found.values?.[0];
  const patchBody: SetEnvVarValueInput = { value, context };
  if (typeof match?.context_parameter === 'string' && match.context_parameter.trim()) {
    patchBody.context_parameter = match.context_parameter.trim();
  }

  try {
    await client.envVars.setValueForSite(accountId, siteId, key, patchBody);
    return;
  } catch (patchErr) {
    if (!(patchErr instanceof NetlifyApiError)) throw patchErr;
  }

  const putBody: UpdateEnvVarInput = {
    key,
    values: mergeEnvValues(found, context, value),
    is_secret: Boolean(found.is_secret),
  };
  const scopes = normalizeScopes(
    Array.isArray(found.scopes) ? found.scopes.filter((s) => typeof s === 'string') : undefined
  );
  if (scopes?.length) putBody.scopes = scopes;

  await client.envVars.updateForSite(accountId, siteId, key, putBody);
}

async function triggerBuildHookUrl(
  fetchImpl: typeof fetch,
  hookUrl: string,
  opts?: { branch?: string; title?: string }
): Promise<void> {
  const url = new URL(hookUrl);
  if (opts?.branch) url.searchParams.set('trigger_branch', opts.branch);
  if (opts?.title) url.searchParams.set('trigger_title', opts.title);
  const res = await fetchImpl(url.toString(), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: '{}',
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new NetlifyApiError(
      text || `Build hook request failed (${res.status})`,
      res.status,
      text
    );
  }
}

async function triggerProductionRedeploy(
  env: Env,
  userId: string,
  client: NetlifyClient,
  siteId: string
): Promise<{ triggered: boolean; buildId: string | null; error: string | null }> {
  const site = await client.sites.get(siteId);
  const branch = pickProductionBranch(site as Record<string, unknown>);
  const title = 'Env variables updated via NetlifyHub';

  try {
    const build = await client.builds.triggerForSite(siteId, { branch, title });
    return {
      triggered: true,
      buildId: typeof build.id === 'string' ? build.id : null,
      error: null,
    };
  } catch (buildErr) {
    const buildStatus = buildErr instanceof NetlifyApiError ? buildErr.status : 0;
    if (buildStatus !== 404 && buildStatus !== 422 && buildStatus !== 400) {
      const msg = buildErr instanceof Error ? buildErr.message : 'Could not trigger build.';
      return { triggered: false, buildId: null, error: msg };
    }
  }

  try {
    const fetchImpl = await createNetlifyFetchForUser(env, userId);
    let hooks = await client.buildHooks.listForSite(siteId);

    if (!hooks.length) {
      const created = await client.buildHooks.create(siteId, {
        title: 'NetlifyHub auto deploy',
        branch: branch ?? 'main',
      });
      hooks = created.url ? [created] : await client.buildHooks.listForSite(siteId);
    }

    const hook =
      hooks.find((h) => h.branch === branch) ??
      hooks.find((h) => !h.branch || h.branch === 'main') ??
      hooks[0];

    if (!hook?.url) {
      return { triggered: false, buildId: null, error: 'No build hook available for this site.' };
    }

    await triggerBuildHookUrl(fetchImpl, hook.url, { branch, title });
    return { triggered: true, buildId: hook.id ?? null, error: null };
  } catch (hookErr) {
    const msg = hookErr instanceof Error ? hookErr.message : 'Could not trigger build hook.';
    return { triggered: false, buildId: null, error: msg };
  }
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
  const context = (input.context ?? 'all') as EnvVarContext;
  const key = input.key.trim();
  if (!key) {
    return { ok: false, error: 'VALIDATION_ERROR', message: 'Key is required.', status: 400 };
  }

  try {
    const accountId = await resolveAccountIdForSite(client, siteId);
    const existing = await client.envVars.listForSite(siteId);
    const found = existing.find((v) => v.key === key);

    if (found) {
      if (found.is_secret && !input.value.trim()) {
        return {
          ok: false,
          error: 'VALIDATION_ERROR',
          message: 'Secret variables require a new value when editing.',
          status: 400,
        };
      }
      await updateExistingEnvVar(client, accountId, siteId, found, key, context, input.value);
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
      redeploy = await triggerProductionRedeploy(env, userId, client, siteId);
    }

    return { ok: true, result: { envVars, redeploy } };
  } catch (e) {
    return { ok: false, ...netlifyError(e) };
  }
}

export async function deleteLinkedNetlifySiteEnvVar(
  env: Env,
  userId: string,
  linkedAccountId: string,
  siteId: string,
  key: string,
  options?: { triggerRedeploy?: boolean }
): Promise<
  | { ok: true; result: SiteEnvSaveResult }
  | { ok: false; error: string; message: string; status: number }
> {
  const clientResult = await createNetlifyClientForLinkedAccount(env, userId, linkedAccountId);
  if (!clientResult.ok) return clientResult;

  const client = clientResult.client;
  const trimmedKey = key.trim();
  if (!trimmedKey) {
    return { ok: false, error: 'VALIDATION_ERROR', message: 'Key is required.', status: 400 };
  }

  try {
    const accountId = await resolveAccountIdForSite(client, siteId);
    await client.envVars.deleteForSite(accountId, siteId, trimmedKey);
    const envVars = (await client.envVars.listForSite(siteId)).map(mapEnvVar);

    let redeploy: SiteEnvSaveResult['redeploy'] = {
      triggered: false,
      buildId: null,
      error: null,
    };
    if (options?.triggerRedeploy !== false) {
      redeploy = await triggerProductionRedeploy(env, userId, client, siteId);
    }

    return { ok: true, result: { envVars, redeploy } };
  } catch (e) {
    return { ok: false, ...netlifyError(e) };
  }
}
