/** Typical JSON error body from Netlify (`swagger.json` → `responses.error`). */
export type NetlifyErrorBody = {
  message: string;
  code?: number;
};

export class NetlifyApiError extends Error {
  override readonly name = 'NetlifyApiError';

  constructor(
    message: string,
    public readonly status: number,
    public readonly body: unknown,
    public readonly requestId?: string
  ) {
    super(message);
  }
}
