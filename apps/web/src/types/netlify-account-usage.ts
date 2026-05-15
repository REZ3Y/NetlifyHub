/** Response shape from `GET /v1/netlify-accounts/:id/usage`. */
export type NetlifyAccountUsage = {
  teamName: string;
  teamSlug: string;
  planName: string | null;
  billingPeriod: { start: string; end: string } | null;
  bandwidth: {
    used: number;
    included: number;
    usedLabel: string;
    includedLabel: string;
  } | null;
  credits: {
    used: number;
    included: number;
    remaining: number;
    remainingLabel: string;
    includedLabel: string;
  } | null;
  buildMinutes: {
    used: number;
    included: number;
    usedLabel: string;
    includedLabel: string;
  };
  concurrentBuilds: {
    active: number;
    limit: number | null;
    label: string;
  };
  teamMembers: {
    count: number;
    limit: number | null;
    label: string;
  };
  otherTeams: { name: string; slug: string }[];
};
