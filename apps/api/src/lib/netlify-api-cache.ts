import { getNetlifyCacheTtlMs } from '../services/panel-settings.service.js';

/** Whether an entry is still valid under the current admin-configured TTL. */
export async function isNetlifyApiCacheFresh(cachedAt: number): Promise<boolean> {
  const ttlMs = await getNetlifyCacheTtlMs();
  return Date.now() - cachedAt < ttlMs;
}

/** `Cache-Control: private, max-age=…` for Netlify-derived HTTP responses (e.g. thumbnails). */
export async function netlifyApiCacheControlHeader(): Promise<string> {
  const ttlMs = await getNetlifyCacheTtlMs();
  const maxAgeSec = Math.max(1, Math.floor(ttlMs / 1000));
  return `private, max-age=${maxAgeSec}`;
}
