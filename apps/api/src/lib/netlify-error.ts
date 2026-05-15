import { NetlifyApiError } from '@netlifyhub/netlify-client';

export function netlifyError(e: unknown): { error: string; message: string; status: number } {
  if (e instanceof NetlifyApiError) {
    return {
      error: 'NETLIFY_API_ERROR',
      message: e.message || 'Netlify API request failed.',
      status: e.status >= 400 && e.status < 600 ? e.status : 502,
    };
  }
  return {
    error: 'NETLIFY_ERROR',
    message: e instanceof Error ? e.message : 'Netlify request failed.',
    status: 502,
  };
}
