import { NETLIFY_API_BASE_URL, NETLIFY_CLIENT_DEFAULTS } from './constants.js';
import { NetlifyApiError } from './errors.js';
import type { HttpMethod, NetlifyRequestInit, QueryValue } from './types.js';

export type NetlifyClientRuntimeOptions = {
  accessToken: string;
  baseUrl: string;
  userAgent: string;
  maxRetries: number;
  initialRetryMs: number;
  maxRetryMs: number;
  timeoutMs: number;
  fetchImpl: typeof fetch;
};

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function buildUrl(baseUrl: string, path: string, query?: Record<string, QueryValue>): string {
  const cleanPath = path.replace(/^\/+/, '');
  const base = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;
  const url = new URL(cleanPath, base);
  if (query) {
    for (const [k, v] of Object.entries(query)) {
      if (v === undefined || v === null) continue;
      url.searchParams.set(k, String(v));
    }
  }
  return url.toString();
}

function parseRetryAfterMs(header: string | null): number | null {
  if (!header) return null;
  const sec = Number(header);
  if (!Number.isNaN(sec) && sec >= 0) return sec * 1000;
  const d = Date.parse(header);
  if (!Number.isNaN(d)) return Math.max(0, d - Date.now());
  return null;
}

async function readErrorBody(response: Response): Promise<unknown> {
  const ct = response.headers.get('content-type') ?? '';
  const text = await response.text();
  if (!text) return null;
  if (ct.includes('application/json')) {
    try {
      return JSON.parse(text) as unknown;
    } catch {
      return text;
    }
  }
  return text;
}

async function parseJsonResponse<T>(response: Response): Promise<T> {
  if (response.status === 204) return undefined as T;
  const text = await response.text();
  if (!text) return undefined as T;
  return JSON.parse(text) as T;
}

export class NetlifyRequestExecutor {
  constructor(private readonly rt: NetlifyClientRuntimeOptions) {}

  async requestJson<T>(
    method: HttpMethod,
    path: string,
    init?: NetlifyRequestInit
  ): Promise<{ data: T; link: string | null }> {
    const url = buildUrl(this.rt.baseUrl, path, init?.query);
    const headers: Record<string, string> = {
      Accept: 'application/json',
      Authorization: `Bearer ${this.rt.accessToken}`,
      'User-Agent': this.rt.userAgent,
      ...init?.headers,
    };

    let body: BodyInit | undefined;
    if (init?.rawBody) {
      body = init.rawBody as BodyInit;
      if (!headers['Content-Type'] && !headers['content-type']) {
        headers['Content-Type'] = 'application/octet-stream';
      }
    } else if (init?.body !== undefined && method !== 'GET') {
      headers['Content-Type'] = 'application/json';
      body = JSON.stringify(init.body);
    }

    const maxAttempts = this.rt.maxRetries + 1;

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), this.rt.timeoutMs);
      let response: Response;
      try {
        response = await this.rt.fetchImpl(url, {
          method,
          headers,
          body: method === 'GET' ? undefined : body,
          signal: controller.signal,
        });
      } catch (e) {
        clearTimeout(timer);
        const err = e as Error;
        if (err.name === 'AbortError') {
          throw new NetlifyApiError(
            `Netlify request timed out after ${this.rt.timeoutMs}ms`,
            0,
            null
          );
        }
        if (attempt + 1 < maxAttempts) {
          const backoff = Math.min(this.rt.maxRetryMs, this.rt.initialRetryMs * 2 ** attempt);
          await sleep(backoff);
          continue;
        }
        throw err;
      }
      clearTimeout(timer);

      const link = response.headers.get('link');
      const requestId = response.headers.get('x-nf-request-id') ?? undefined;

      if (response.ok) {
        const data = await parseJsonResponse<T>(response);
        return { data, link };
      }

      const errBody = await readErrorBody(response);
      const msg =
        typeof errBody === 'object' &&
        errBody !== null &&
        'message' in errBody &&
        typeof (errBody as { message: unknown }).message === 'string'
          ? (errBody as { message: string }).message
          : `Netlify API error (${response.status})`;

      const retryable = response.status === 429 || response.status === 503;
      if (retryable && attempt + 1 < maxAttempts) {
        const retryAfter = parseRetryAfterMs(response.headers.get('retry-after'));
        const backoff = Math.min(
          this.rt.maxRetryMs,
          retryAfter ?? this.rt.initialRetryMs * 2 ** attempt
        );
        await sleep(backoff);
        continue;
      }

      throw new NetlifyApiError(msg, response.status, errBody, requestId);
    }

    throw new NetlifyApiError('Netlify request exhausted retries', 0, null);
  }
}

export function resolveRuntimeOptions(input: {
  accessToken: string;
  baseUrl?: string;
  userAgent?: string;
  maxRetries?: number;
  initialRetryMs?: number;
  maxRetryMs?: number;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
}): NetlifyClientRuntimeOptions {
  return {
    accessToken: input.accessToken,
    baseUrl: input.baseUrl ?? NETLIFY_API_BASE_URL,
    userAgent: input.userAgent ?? NETLIFY_CLIENT_DEFAULTS.userAgent,
    maxRetries: input.maxRetries ?? NETLIFY_CLIENT_DEFAULTS.maxRetries,
    initialRetryMs: input.initialRetryMs ?? NETLIFY_CLIENT_DEFAULTS.initialRetryMs,
    maxRetryMs: input.maxRetryMs ?? NETLIFY_CLIENT_DEFAULTS.maxRetryMs,
    timeoutMs: input.timeoutMs ?? NETLIFY_CLIENT_DEFAULTS.timeoutMs,
    fetchImpl: input.fetchImpl ?? fetch,
  };
}
