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

export type NetlifyAccount = Record<string, unknown> & {
  id?: string;
  name?: string;
  slug?: string;
  type?: string;
};

export type NetlifyUser = Record<string, unknown> & {
  id?: number;
  email?: string;
  full_name?: string;
  avatar_url?: string;
};
