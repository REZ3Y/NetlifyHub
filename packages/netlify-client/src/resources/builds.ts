import type { NetlifyRequestExecutor } from '../request-executor.js';
import type { NetlifyBuild } from '../types.js';

export type TriggerSiteBuildParams = {
  branch?: string;
  clear_cache?: boolean;
  title?: string;
};

export class NetlifyBuildsResource {
  constructor(private readonly exec: NetlifyRequestExecutor) {}

  /**
   * `POST /sites/{site_id}/builds` — schedules a build (e.g. after env changes on a Git-connected site).
   * @see Netlify OpenAPI `createSiteBuild`
   */
  async triggerForSite(siteId: string, params?: TriggerSiteBuildParams): Promise<NetlifyBuild> {
    const { data } = await this.exec.requestJson<NetlifyBuild>(
      'POST',
      `sites/${encodeURIComponent(siteId)}/builds`,
      {
        query: {
          branch: params?.branch,
          clear_cache: params?.clear_cache,
          title: params?.title,
        },
        body: {},
      }
    );
    return data;
  }
}
