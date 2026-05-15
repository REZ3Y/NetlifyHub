import type { NetlifyRequestExecutor } from '../request-executor.js';
import type { NetlifyEnvVar } from '../types.js';

export type EnvVarContext =
  | 'all'
  | 'dev'
  | 'dev-server'
  | 'branch-deploy'
  | 'deploy-preview'
  | 'production'
  | 'branch';

export type CreateEnvVarInput = {
  key: string;
  values: Array<{
    value: string;
    context: EnvVarContext;
    context_parameter?: string;
  }>;
  scopes?: Array<'builds' | 'functions' | 'runtime' | 'post-processing'>;
  is_secret?: boolean;
};

export type SetEnvVarValueInput = {
  value: string;
  context: EnvVarContext;
  context_parameter?: string;
};

export type UpdateEnvVarInput = {
  key?: string;
  values: Array<{
    id?: string;
    value: string;
    context: EnvVarContext;
    context_parameter?: string;
  }>;
  scopes?: Array<'builds' | 'functions' | 'runtime' | 'post-processing'>;
  is_secret?: boolean;
};

export class NetlifyEnvVarsResource {
  constructor(private readonly exec: NetlifyRequestExecutor) {}

  /** `GET /sites/{site_id}/env` */
  async listForSite(siteId: string): Promise<NetlifyEnvVar[]> {
    const { data } = await this.exec.requestJson<NetlifyEnvVar[]>(
      'GET',
      `sites/${encodeURIComponent(siteId)}/env`
    );
    return data ?? [];
  }

  /** `POST /accounts/{account_id}/env?site_id=…` */
  async createForSite(
    accountId: string,
    siteId: string,
    items: CreateEnvVarInput[]
  ): Promise<NetlifyEnvVar[]> {
    const { data } = await this.exec.requestJson<NetlifyEnvVar[]>(
      'POST',
      `accounts/${encodeURIComponent(accountId)}/env`,
      {
        query: { site_id: siteId },
        body: items,
      }
    );
    return data ?? [];
  }

  /** `PATCH /accounts/{account_id}/env/{key}?site_id=…` */
  async setValueForSite(
    accountId: string,
    siteId: string,
    key: string,
    body: SetEnvVarValueInput
  ): Promise<NetlifyEnvVar> {
    const { data } = await this.exec.requestJson<NetlifyEnvVar>(
      'PATCH',
      `accounts/${encodeURIComponent(accountId)}/env/${encodeURIComponent(key)}`,
      {
        query: { site_id: siteId },
        body,
      }
    );
    return data;
  }

  /** `DELETE /accounts/{account_id}/env/{key}?site_id=…` */
  async deleteForSite(accountId: string, siteId: string, key: string): Promise<void> {
    await this.exec.requestJson<unknown>(
      'DELETE',
      `accounts/${encodeURIComponent(accountId)}/env/${encodeURIComponent(key)}`,
      { query: { site_id: siteId } }
    );
  }

  /** `PUT /accounts/{account_id}/env/{key}?site_id=…` */
  async updateForSite(
    accountId: string,
    siteId: string,
    key: string,
    body: UpdateEnvVarInput
  ): Promise<NetlifyEnvVar> {
    const { data } = await this.exec.requestJson<NetlifyEnvVar>(
      'PUT',
      `accounts/${encodeURIComponent(accountId)}/env/${encodeURIComponent(key)}`,
      {
        query: { site_id: siteId },
        body,
      }
    );
    return data;
  }
}
