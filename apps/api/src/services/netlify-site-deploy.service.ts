import type { NetlifyDeploy } from '@netlifyhub/netlify-client';
import type { Env } from '../config/env.js';
import { createNetlifyClientForLinkedAccount } from '../lib/netlify-linked-client.js';
import { netlifyError } from '../lib/netlify-error.js';
import { readPanelDeployArtifactZip } from './panel-deploy-artifact.service.js';

export type SiteDeployDto = {
  id: string;
  state: string;
  branch: string | null;
  context: string | null;
  deployUrl: string | null;
  createdAt: string | null;
  publishedAt: string | null;
};

export type SiteDeployResultDto = {
  deploy: SiteDeployDto;
};

function mapDeploy(raw: NetlifyDeploy): SiteDeployDto {
  const published = raw.published_at ?? raw.publishedAt;
  return {
    id: typeof raw.id === 'string' ? raw.id : '',
    state: typeof raw.state === 'string' ? raw.state : 'unknown',
    branch: typeof raw.branch === 'string' ? raw.branch : null,
    context: typeof raw.context === 'string' ? raw.context : null,
    deployUrl:
      (typeof raw.ssl_url === 'string' && raw.ssl_url) ||
      (typeof raw.deploy_url === 'string' && raw.deploy_url) ||
      null,
    createdAt: typeof raw.created_at === 'string' ? raw.created_at : null,
    publishedAt: typeof published === 'string' ? published : null,
  };
}

export async function fetchLinkedNetlifySiteDeploys(
  env: Env,
  userId: string,
  linkedAccountId: string,
  siteId: string
): Promise<
  | { ok: true; deploys: SiteDeployDto[] }
  | { ok: false; error: string; message: string; status: number }
> {
  const clientResult = await createNetlifyClientForLinkedAccount(env, userId, linkedAccountId);
  if (!clientResult.ok) return clientResult;

  try {
    const { data } = await clientResult.client.deploys.listForSite(siteId, {
      per_page: 25,
      page: 1,
    });
    const list = Array.isArray(data) ? data : [];
    return { ok: true, deploys: list.map(mapDeploy).filter((d) => d.id) };
  } catch (e) {
    return { ok: false, ...netlifyError(e) };
  }
}

export async function deployLinkedNetlifySiteFromZip(
  env: Env,
  userId: string,
  linkedAccountId: string,
  siteId: string,
  zip: Uint8Array
): Promise<
  | { ok: true; result: SiteDeployResultDto }
  | { ok: false; error: string; message: string; status: number }
> {
  const clientResult = await createNetlifyClientForLinkedAccount(env, userId, linkedAccountId);
  if (!clientResult.ok) return clientResult;

  try {
    const deploy = await clientResult.client.deploys.createFromZip(siteId, zip);
    return { ok: true, result: { deploy: mapDeploy(deploy) } };
  } catch (e) {
    return { ok: false, ...netlifyError(e) };
  }
}

export async function deployLinkedNetlifySiteFromArtifact(
  env: Env,
  userId: string,
  linkedAccountId: string,
  siteId: string,
  artifactId: string
): Promise<
  | { ok: true; result: SiteDeployResultDto }
  | { ok: false; error: string; message: string; status: number }
> {
  const fileResult = await readPanelDeployArtifactZip(env, userId, artifactId);
  if (!fileResult.ok) return fileResult;
  return deployLinkedNetlifySiteFromZip(env, userId, linkedAccountId, siteId, fileResult.bytes);
}

export async function restoreLinkedNetlifySiteDeploy(
  env: Env,
  userId: string,
  linkedAccountId: string,
  siteId: string,
  deployId: string
): Promise<
  | { ok: true; result: SiteDeployResultDto }
  | { ok: false; error: string; message: string; status: number }
> {
  const clientResult = await createNetlifyClientForLinkedAccount(env, userId, linkedAccountId);
  if (!clientResult.ok) return clientResult;

  try {
    const deploy = await clientResult.client.deploys.restore(siteId, deployId);
    return { ok: true, result: { deploy: mapDeploy(deploy) } };
  } catch (e) {
    return { ok: false, ...netlifyError(e) };
  }
}
