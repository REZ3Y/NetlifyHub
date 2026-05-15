export type ObservabilityRange = '1h' | '6h' | '24h' | '7d';

export type SiteObservability = {
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
