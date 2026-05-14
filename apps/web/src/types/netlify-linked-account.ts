/** Response shape from `GET|POST|PATCH /v1/netlify-accounts` (single account). */
export type LinkedNetlifyAccount = {
  id: string;
  label: string | null;
  netlifyId: string;
  uid: string;
  fullName: string | null;
  avatarUrl: string | null;
  email: string | null;
  affiliateId: string | null;
  siteCount: number;
  netlifyCreatedAt: string | null;
  netlifyLastLogin: string | null;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
};
