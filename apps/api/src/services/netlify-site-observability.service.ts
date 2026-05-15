import { NetlifyApiError } from '@netlifyhub/netlify-client';
import type { Env } from '../config/env.js';
import { getNetlifyCacheTtlMs } from './panel-settings.service.js';
import { createNetlifyClientForLinkedAccount } from '../lib/netlify-linked-client.js';

export type ObservabilityRange = '1h' | '6h' | '24h' | '7d';

export type SiteObservabilityDto = {
  available: boolean;
  unavailableReason: string | null;
  range: ObservabilityRange;
  periodLabel: string;
  periodStart: string;
  periodEnd: string;
  summary: {
    totalRequests: number;
    errorCount: number;
    errorRatePercent: number;
  };
  series: Array<{
    timestamp: string;
    requests: number;
    errors: number;
    success: number;
  }>;
  stats: {
    bandwidthLabel: string;
    bandwidthBytes: number;
    functionsLabel: string;
    functionsPercent: number;
    functionsCount: number;
    nonBrowserLabel: string;
    nonBrowserPercent: number;
    nonBrowserCount: number;
  };
};

type CacheEntry = { data: SiteObservabilityDto; expiresAt: number };
const cache = new Map<string, CacheEntry>();

function cacheKey(
  userId: string,
  linkedAccountId: string,
  siteId: string,
  range: ObservabilityRange
): string {
  return `${userId}:${linkedAccountId}:${siteId}:${range}`;
}

function rangeWindow(range: ObservabilityRange): { start: Date; end: Date; label: string } {
  const end = new Date();
  const start = new Date(end);
  switch (range) {
    case '1h':
      start.setHours(start.getHours() - 1);
      return { start, end, label: 'Last hour' };
    case '6h':
      start.setHours(start.getHours() - 6);
      return { start, end, label: 'Last 6 hours' };
    case '24h':
      start.setHours(start.getHours() - 24);
      return { start, end, label: 'Last 24 hours' };
    case '7d':
      start.setDate(start.getDate() - 7);
      return { start, end, label: 'Last 7 days' };
  }
}

function emptyObservability(
  range: ObservabilityRange,
  start: Date,
  end: Date,
  label: string,
  reason: string | null
): SiteObservabilityDto {
  return {
    available: false,
    unavailableReason: reason,
    range,
    periodLabel: label,
    periodStart: start.toISOString(),
    periodEnd: end.toISOString(),
    summary: { totalRequests: 0, errorCount: 0, errorRatePercent: 0 },
    series: [],
    stats: {
      bandwidthLabel: '0 bytes',
      bandwidthBytes: 0,
      functionsLabel: '0.0% (0)',
      functionsPercent: 0,
      functionsCount: 0,
      nonBrowserLabel: '0.0% (0)',
      nonBrowserPercent: 0,
      nonBrowserCount: 0,
    },
  };
}

function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 bytes';
  if (bytes < 1024) return `${bytes} bytes`;
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
  return `${(bytes / 1024 ** 3).toFixed(2)} GB`;
}

function asNumber(v: unknown): number {
  const n = typeof v === 'number' ? v : typeof v === 'string' ? Number(v) : NaN;
  return Number.isFinite(n) ? n : 0;
}

function asRecord(v: unknown): Record<string, unknown> | null {
  return v !== null && typeof v === 'object' && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : null;
}

/** Best-effort normalizer for undocumented Netlify observability payloads. */
function normalizeObservabilityPayload(
  raw: unknown,
  range: ObservabilityRange,
  start: Date,
  end: Date,
  label: string
): SiteObservabilityDto | null {
  const root = asRecord(raw);
  if (!root) return null;

  const summarySrc =
    asRecord(root.summary) ?? asRecord(root.overview) ?? asRecord(root.totals) ?? root;

  const totalRequests = asNumber(
    summarySrc.total_requests ?? summarySrc.requests ?? summarySrc.request_count ?? summarySrc.count
  );
  const errorCount = asNumber(
    summarySrc.errors ?? summarySrc.error_count ?? summarySrc.error_requests
  );
  const errorRatePercent =
    asNumber(summarySrc.error_rate ?? summarySrc.error_rate_percent) ||
    (totalRequests > 0 ? (errorCount / totalRequests) * 100 : 0);

  const seriesRaw =
    (Array.isArray(root.series) && root.series) ||
    (Array.isArray(root.buckets) && root.buckets) ||
    (Array.isArray(root.datapoints) && root.datapoints) ||
    (Array.isArray(root.data) && root.data) ||
    [];

  const series = seriesRaw
    .map((point) => {
      const p = asRecord(point);
      if (!p) return null;
      const requests = asNumber(p.requests ?? p.count ?? p.total);
      const errors = asNumber(p.errors ?? p.error_count ?? p.error_requests);
      const ts =
        (typeof p.timestamp === 'string' && p.timestamp) ||
        (typeof p.time === 'string' && p.time) ||
        (typeof p.t === 'string' && p.t) ||
        start.toISOString();
      return {
        timestamp: ts,
        requests,
        errors,
        success: Math.max(0, requests - errors),
      };
    })
    .filter((p): p is NonNullable<typeof p> => p !== null);

  const statsSrc = asRecord(root.stats) ?? asRecord(root.metrics) ?? root;
  const bandwidthBytes = asNumber(statsSrc.bandwidth ?? statsSrc.bandwidth_bytes ?? statsSrc.bytes);
  const functionsCount = asNumber(statsSrc.functions ?? statsSrc.function_invocations);
  const functionsPercent = asNumber(statsSrc.functions_percent ?? statsSrc.function_rate);
  const nonBrowserCount = asNumber(statsSrc.non_browser ?? statsSrc.non_browser_requests);
  const nonBrowserPercent = asNumber(statsSrc.non_browser_percent ?? statsSrc.non_browser_rate);

  if (totalRequests === 0 && series.length === 0 && bandwidthBytes === 0) {
    return null;
  }

  return {
    available: true,
    unavailableReason: null,
    range,
    periodLabel: label,
    periodStart: start.toISOString(),
    periodEnd: end.toISOString(),
    summary: {
      totalRequests,
      errorCount,
      errorRatePercent: Math.round(errorRatePercent * 100) / 100,
    },
    series,
    stats: {
      bandwidthLabel: formatBytes(bandwidthBytes),
      bandwidthBytes,
      functionsLabel: `${functionsPercent.toFixed(1)}% (${functionsCount})`,
      functionsPercent,
      functionsCount,
      nonBrowserLabel: `${nonBrowserPercent.toFixed(1)}% (${nonBrowserCount})`,
      nonBrowserPercent,
      nonBrowserCount,
    },
  };
}

const PROBE_PATHS = (siteId: string, from: string, to: string) => [
  `sites/${encodeURIComponent(siteId)}/observability?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`,
  `sites/${encodeURIComponent(siteId)}/observability/metrics?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`,
  `sites/${encodeURIComponent(siteId)}/metrics?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`,
  `observability/sites/${encodeURIComponent(siteId)}?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`,
];

export async function fetchLinkedNetlifySiteObservability(
  env: Env,
  userId: string,
  linkedAccountId: string,
  siteId: string,
  range: ObservabilityRange
): Promise<
  | { ok: true; observability: SiteObservabilityDto }
  | { ok: false; error: string; message: string; status: number }
> {
  const key = cacheKey(userId, linkedAccountId, siteId, range);
  const hit = cache.get(key);
  if (hit && hit.expiresAt > Date.now()) {
    return { ok: true, observability: hit.data };
  }

  const clientResult = await createNetlifyClientForLinkedAccount(env, userId, linkedAccountId);
  if (!clientResult.ok) return clientResult;

  const { start, end, label } = rangeWindow(range);
  const from = start.toISOString();
  const to = end.toISOString();

  for (const path of PROBE_PATHS(siteId, from, to)) {
    try {
      const { data } = await clientResult.client.requestJson<unknown>('GET', path);
      const normalized = normalizeObservabilityPayload(data, range, start, end, label);
      if (normalized) {
        const ttlMs = await getNetlifyCacheTtlMs();
        cache.set(key, {
          data: normalized,
          expiresAt: Date.now() + ttlMs,
        });
        return { ok: true, observability: normalized };
      }
    } catch (e) {
      if (e instanceof NetlifyApiError && (e.status === 404 || e.status === 403)) continue;
      if (e instanceof NetlifyApiError) {
        return {
          ok: false,
          error: 'NETLIFY_API_ERROR',
          message: e.message || 'Netlify API request failed.',
          status: e.status >= 400 && e.status < 600 ? e.status : 502,
        };
      }
    }
  }

  const empty = emptyObservability(
    range,
    start,
    end,
    label,
    'Observability metrics are not exposed on the public Netlify REST API for this token.'
  );
  const ttlMs = await getNetlifyCacheTtlMs();
  cache.set(key, { data: empty, expiresAt: Date.now() + ttlMs });
  return { ok: true, observability: empty };
}
