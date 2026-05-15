import type { NetlifyRequestExecutor } from '../request-executor.js';
import type { PaginatedResult } from '../pagination.js';
import type {
  NetlifyAccount,
  NetlifyAccountBandwidth,
  NetlifyAccountBuildStatus,
} from '../types.js';

export class NetlifyAccountsResource {
  constructor(private readonly exec: NetlifyRequestExecutor) {}

  /** `GET /accounts` — list accounts the current user belongs to. */
  async list(): Promise<PaginatedResult<NetlifyAccount[]>> {
    const { data, link } = await this.exec.requestJson<NetlifyAccount[]>('GET', 'accounts');
    return { data, link };
  }

  /** `GET /accounts/{account_id}` */
  async get(accountId: string): Promise<NetlifyAccount> {
    const { data } = await this.exec.requestJson<NetlifyAccount>(
      'GET',
      `accounts/${encodeURIComponent(accountId)}`
    );
    return data;
  }

  /**
   * `GET /accounts/{account_slug}/bandwidth`
   * Not listed on open-api.netlify.com; documented in community posts and used by the Netlify UI.
   */
  async getBandwidth(accountSlug: string): Promise<NetlifyAccountBandwidth> {
    const { data } = await this.exec.requestJson<NetlifyAccountBandwidth>(
      'GET',
      `accounts/${encodeURIComponent(accountSlug)}/bandwidth`
    );
    return data;
  }

  /** `GET /{account_id}/builds/status` */
  async getBuildStatus(accountId: string): Promise<NetlifyAccountBuildStatus[]> {
    const { data } = await this.exec.requestJson<NetlifyAccountBuildStatus[]>(
      'GET',
      `${encodeURIComponent(accountId)}/builds/status`
    );
    return data;
  }
}
