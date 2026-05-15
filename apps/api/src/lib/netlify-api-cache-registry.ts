const cacheClearers: Array<() => void> = [];

/** Register a cache map clear function (called when admin changes Netlify cache TTL). */
export function registerNetlifyApiCacheClearer(clear: () => void): void {
  cacheClearers.push(clear);
}

/** Clear all in-memory Netlify API response caches (usage, sites, observability, …). */
export function invalidateAllNetlifyApiCaches(): void {
  for (const clear of cacheClearers) clear();
}
