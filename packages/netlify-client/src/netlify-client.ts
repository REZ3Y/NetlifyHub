import { NetlifyRequestExecutor, resolveRuntimeOptions } from './request-executor.js';
import { NetlifyAccountsResource } from './resources/accounts.js';
import { NetlifyBuildsResource } from './resources/builds.js';
import { NetlifyDeploysResource } from './resources/deploys.js';
import { NetlifyEnvVarsResource } from './resources/env-vars.js';
import { NetlifySitesResource } from './resources/sites.js';
import { NetlifyUserResource } from './resources/user.js';
import type { HttpMethod, NetlifyRequestInit } from './types.js';
import type { PaginatedResult } from './pagination.js';

export type NetlifyClientOptions = {
  /** Personal access token or OAuth access token (never log or persist in plain text). */
  accessToken: string;
  /** Default `https://api.netlify.com/api/v1` (OpenAPI `host` + `basePath`). */
  baseUrl?: string;
  userAgent?: string;
  maxRetries?: number;
  initialRetryMs?: number;
  maxRetryMs?: number;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
};

/**
 * Typed facade over Netlify REST API (`swagger.json` / `open-api.netlify.com`).
 * Use `requestJson` for paths not yet wrapped. Intended for API routes and BullMQ workers.
 */
export class NetlifyClient {
  private readonly exec: NetlifyRequestExecutor;

  readonly sites: NetlifySitesResource;
  readonly deploys: NetlifyDeploysResource;
  readonly builds: NetlifyBuildsResource;
  readonly envVars: NetlifyEnvVarsResource;
  readonly accounts: NetlifyAccountsResource;
  readonly user: NetlifyUserResource;

  constructor(options: NetlifyClientOptions) {
    const rt = resolveRuntimeOptions(options);
    this.exec = new NetlifyRequestExecutor(rt);
    this.sites = new NetlifySitesResource(this.exec);
    this.deploys = new NetlifyDeploysResource(this.exec);
    this.builds = new NetlifyBuildsResource(this.exec);
    this.envVars = new NetlifyEnvVarsResource(this.exec);
    this.accounts = new NetlifyAccountsResource(this.exec);
    this.user = new NetlifyUserResource(this.exec);
  }

  /** Escape hatch — call any documented path relative to `baseUrl` (no leading `/`). */
  requestJson<T>(
    method: HttpMethod,
    path: string,
    init?: NetlifyRequestInit
  ): Promise<PaginatedResult<T>> {
    return this.exec.requestJson<T>(method, path, init);
  }
}

export function createNetlifyClient(options: NetlifyClientOptions): NetlifyClient {
  return new NetlifyClient(options);
}
