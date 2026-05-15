export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

/** Query values sent as repeated keys or single string (booleans → "true"/"false"). */
export type QueryValue = string | number | boolean | undefined | null;

export type NetlifyRequestInit = {
  query?: Record<string, QueryValue>;
  /** JSON body (`Content-Type: application/json`). */
  body?: unknown;
  /** Raw body (e.g. `application/zip` deploy); do not set `body` together with this. */
  rawBody?: Uint8Array;
  /** Merged after defaults; e.g. `Content-Type` for `rawBody`. */
  headers?: Record<string, string>;
};

/** Partial site model — extend as needed when syncing to DB. */
export type NetlifySite = Record<string, unknown> & {
  id?: string;
  name?: string;
  url?: string;
  ssl_url?: string;
  admin_url?: string;
  account_slug?: string;
  account_id?: string;
  account_name?: string;
  custom_domain?: string;
  screenshot_url?: string;
  build_settings?: Record<string, unknown>;
  deploy_hook?: Record<string, unknown>;
  published_deploy?: Record<string, unknown>;
  state?: string;
  created_at?: string;
  updated_at?: string;
};

/** Partial deploy model. */
export type NetlifyDeploy = Record<string, unknown> & {
  id?: string;
  site_id?: string;
  state?: string;
  branch?: string;
  deploy_url?: string;
  ssl_url?: string;
  admin_url?: string;
  created_at?: string;
  updated_at?: string;
};

export type NetlifyCapabilityQuota = {
  included?: number;
  used?: number;
};

export type NetlifyAccount = Record<string, unknown> & {
  id?: string;
  name?: string;
  slug?: string;
  type?: string;
  type_name?: string;
  type_id?: string;
  billing_period?: string | null;
  capabilities?: Record<string, NetlifyCapabilityQuota | unknown>;
};

/** `GET /accounts/{account_slug}/bandwidth` (undocumented in OpenAPI; used by Netlify dashboard). */
export type NetlifyAccountBandwidth = {
  used?: number;
  included?: number;
  additional?: number;
  last_updated_at?: string;
  period_start_date?: string;
  period_end_date?: string;
};

export type NetlifyAccountBuildStatusMinutes = {
  current?: number;
  current_average_sec?: number;
  previous?: number;
  period_start_date?: string;
  period_end_date?: string;
  last_updated_at?: string;
  included_minutes?: string | number;
  included_minutes_with_packs?: string | number;
};

/** `GET /{account_id}/builds/status` */
export type NetlifyAccountBuildStatus = {
  active?: number;
  pending_concurrency?: number;
  enqueued?: number;
  build_count?: number;
  minutes?: NetlifyAccountBuildStatusMinutes;
};

export type NetlifyUser = Record<string, unknown> & {
  id?: number;
  email?: string;
  full_name?: string;
  avatar_url?: string;
};

export type NetlifyEnvVarValue = {
  id?: string;
  value?: string;
  context?: string;
  context_parameter?: string;
};

export type NetlifyEnvVar = {
  key: string;
  scopes?: string[];
  values?: NetlifyEnvVarValue[];
  is_secret?: boolean;
  updated_at?: string;
};

export type NetlifyBuild = Record<string, unknown> & {
  id?: string;
  deploy_id?: string;
  sha?: string;
  done?: boolean;
  error?: string;
  created_at?: string;
};
