export type SiteEnvVarValue = {
  id: string | null;
  context: string;
  contextParameter: string | null;
  value: string;
  hasValue: boolean;
};

export type SiteEnvVar = {
  key: string;
  isSecret: boolean;
  scopes: string[];
  values: SiteEnvVarValue[];
  updatedAt: string | null;
};

export type SiteEnvSaveResult = {
  envVars: SiteEnvVar[];
  redeploy: { triggered: boolean; buildId: string | null; error: string | null };
};
