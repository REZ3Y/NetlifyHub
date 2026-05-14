import type { NetlifyRequestExecutor } from '../request-executor.js';
import type { PaginatedResult } from '../pagination.js';
import type { NetlifyAccount } from '../types.js';

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
}
