import type { NetlifyRequestExecutor } from '../request-executor.js';
import type { PaginatedResult } from '../pagination.js';
import type { NetlifySite } from '../types.js';

export type ListSitesParams = {
  name?: string;
  filter?: 'all' | 'owner' | 'guest';
  page?: number;
  per_page?: number;
};

export class NetlifySitesResource {
  constructor(private readonly exec: NetlifyRequestExecutor) {}

  /** `GET /{account_slug}/sites` */
  async listForAccount(
    accountSlug: string,
    params?: { page?: number; per_page?: number }
  ): Promise<PaginatedResult<NetlifySite[]>> {
    const { data, link } = await this.exec.requestJson<NetlifySite[]>(
      'GET',
      `${encodeURIComponent(accountSlug)}/sites`,
      {
        query: {
          page: params?.page,
          per_page: params?.per_page,
        },
      }
    );
    return { data, link };
  }

  /** `GET /sites` */
  async list(params?: ListSitesParams): Promise<PaginatedResult<NetlifySite[]>> {
    const { data, link } = await this.exec.requestJson<NetlifySite[]>('GET', 'sites', {
      query: {
        name: params?.name,
        filter: params?.filter,
        page: params?.page,
        per_page: params?.per_page,
      },
    });
    return { data, link };
  }

  /** `GET /sites/{site_id}` */
  async get(siteId: string): Promise<NetlifySite> {
    const { data } = await this.exec.requestJson<NetlifySite>(
      'GET',
      `sites/${encodeURIComponent(siteId)}`
    );
    return data;
  }

  /** `POST /sites` — create site (body matches OpenAPI `siteSetup` / `site` fields). */
  async create(body: Record<string, unknown>): Promise<NetlifySite> {
    const { data } = await this.exec.requestJson<NetlifySite>('POST', 'sites', { body });
    return data;
  }

  /** `PATCH /sites/{site_id}` */
  async update(siteId: string, body: Record<string, unknown>): Promise<NetlifySite> {
    const { data } = await this.exec.requestJson<NetlifySite>(
      'PATCH',
      `sites/${encodeURIComponent(siteId)}`,
      {
        body,
      }
    );
    return data;
  }

  /** `DELETE /sites/{site_id}` */
  async remove(siteId: string): Promise<void> {
    await this.exec.requestJson<unknown>('DELETE', `sites/${encodeURIComponent(siteId)}`);
  }
}
