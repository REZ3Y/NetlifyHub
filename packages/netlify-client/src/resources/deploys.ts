import type { NetlifyRequestExecutor } from '../request-executor.js';
import type { PaginatedResult } from '../pagination.js';
import type { NetlifyDeploy } from '../types.js';

export type ListSiteDeploysParams = {
  'deploy-previews'?: boolean;
  production?: boolean;
  state?: string;
  branch?: string;
  'latest-published'?: boolean;
  page?: number;
  per_page?: number;
};

export class NetlifyDeploysResource {
  constructor(private readonly exec: NetlifyRequestExecutor) {}

  /** `GET /sites/{site_id}/deploys` */
  async listForSite(
    siteId: string,
    params?: ListSiteDeploysParams
  ): Promise<PaginatedResult<NetlifyDeploy[]>> {
    const { data, link } = await this.exec.requestJson<NetlifyDeploy[]>(
      'GET',
      `sites/${encodeURIComponent(siteId)}/deploys`,
      {
        query: {
          'deploy-previews': params?.['deploy-previews'],
          production: params?.production,
          state: params?.state,
          branch: params?.branch,
          'latest-published': params?.['latest-published'],
          page: params?.page,
          per_page: params?.per_page,
        },
      }
    );
    return { data, link };
  }

  /** `GET /sites/{site_id}/deploys/{deploy_id}` */
  async getForSite(siteId: string, deployId: string): Promise<NetlifyDeploy> {
    const { data } = await this.exec.requestJson<NetlifyDeploy>(
      'GET',
      `sites/${encodeURIComponent(siteId)}/deploys/${encodeURIComponent(deployId)}`
    );
    return data;
  }

  /** `GET /deploys/{deploy_id}` */
  async get(deployId: string): Promise<NetlifyDeploy> {
    const { data } = await this.exec.requestJson<NetlifyDeploy>(
      'GET',
      `deploys/${encodeURIComponent(deployId)}`
    );
    return data;
  }

  /**
   * `POST /sites/{site_id}/deploys` with `Content-Type: application/zip` (raw zip body).
   * @see Netlify OpenAPI `createSiteDeploy`
   */
  async createFromZip(siteId: string, zip: Uint8Array): Promise<NetlifyDeploy> {
    const { data } = await this.exec.requestJson<NetlifyDeploy>(
      'POST',
      `sites/${encodeURIComponent(siteId)}/deploys`,
      {
        rawBody: zip,
        headers: { 'Content-Type': 'application/zip' },
      }
    );
    return data;
  }

  /**
   * `POST /sites/{site_id}/deploys` with JSON `{ files: { "path": "sha1", ... } }` (digest deploy).
   * @see Netlify OpenAPI `createSiteDeploy`
   */
  async createFromFileDigests(
    siteId: string,
    files: Record<string, string>
  ): Promise<NetlifyDeploy> {
    const { data } = await this.exec.requestJson<NetlifyDeploy>(
      'POST',
      `sites/${encodeURIComponent(siteId)}/deploys`,
      { body: { files } }
    );
    return data;
  }

  /** `POST /deploys/{deploy_id}/cancel` */
  async cancel(deployId: string): Promise<NetlifyDeploy> {
    const { data } = await this.exec.requestJson<NetlifyDeploy>(
      'POST',
      `deploys/${encodeURIComponent(deployId)}/cancel`
    );
    return data;
  }

  /** `POST /sites/{site_id}/deploys/{deploy_id}/restore` */
  async restore(siteId: string, deployId: string): Promise<NetlifyDeploy> {
    const { data } = await this.exec.requestJson<NetlifyDeploy>(
      'POST',
      `sites/${encodeURIComponent(siteId)}/deploys/${encodeURIComponent(deployId)}/restore`
    );
    return data;
  }
}
