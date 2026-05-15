export type NetlifyAccountUsageSummary = {
  planName: string | null;
  quotaLabel: string | null;
  quotaKind: 'bandwidth' | 'credits' | null;
};
