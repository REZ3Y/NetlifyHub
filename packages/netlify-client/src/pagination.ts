/** Raw `Link` header from paginated list endpoints (RFC 8288). */
export type PaginatedMeta = {
  link: string | null;
};

export type PaginatedResult<T> = {
  data: T;
} & PaginatedMeta;

/** Best-effort parse of `rel="next"` URL from a `Link` header. */
export function parseNextUrlFromLinkHeader(linkHeader: string | null): string | null {
  if (!linkHeader) return null;
  for (const part of linkHeader.split(',')) {
    const m = /<([^>]+)>;\s*rel="next"/i.exec(part.trim());
    if (m?.[1]) return m[1];
  }
  return null;
}
