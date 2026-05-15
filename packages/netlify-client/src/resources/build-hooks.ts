import type { NetlifyRequestExecutor } from '../request-executor.js';
import type { NetlifyBuildHook } from '../types.js';

export class NetlifyBuildHooksResource {
  constructor(private readonly exec: NetlifyRequestExecutor) {}

  /** `GET /sites/{site_id}/build_hooks` */
  async listForSite(siteId: string): Promise<NetlifyBuildHook[]> {
    const { data } = await this.exec.requestJson<NetlifyBuildHook[]>(
      'GET',
      `sites/${encodeURIComponent(siteId)}/build_hooks`
    );
    return data ?? [];
  }

  /** `POST /sites/{site_id}/build_hooks` */
  async create(
    siteId: string,
    body: { title?: string; branch?: string }
  ): Promise<NetlifyBuildHook> {
    const { data } = await this.exec.requestJson<NetlifyBuildHook>(
      'POST',
      `sites/${encodeURIComponent(siteId)}/build_hooks`,
      { body }
    );
    return data;
  }
}
