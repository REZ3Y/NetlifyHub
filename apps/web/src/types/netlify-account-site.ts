/** Response shape from `GET /v1/netlify-accounts/:id/sites`. */
export type NetlifyLinkedSite = {
  id: string;
  name: string;
  displayDomain: string | null;
  copyDomain: string | null;
  deploySource: string;
  ownerName: string | null;
  publishedAt: string | null;
  adminUrl: string | null;
  sslUrl: string | null;
  hasThumbnail: boolean;
};

export type NetlifyAccountSitesResponse = {
  teamName: string;
  sites: NetlifyLinkedSite[];
};
