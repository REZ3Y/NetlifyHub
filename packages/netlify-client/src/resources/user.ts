import type { NetlifyRequestExecutor } from '../request-executor.js';
import type { NetlifyUser } from '../types.js';

export class NetlifyUserResource {
  constructor(private readonly exec: NetlifyRequestExecutor) {}

  /** `GET /user` — current user (PAT / OAuth). */
  async get(): Promise<NetlifyUser> {
    const { data } = await this.exec.requestJson<NetlifyUser>('GET', 'user');
    return data;
  }
}
