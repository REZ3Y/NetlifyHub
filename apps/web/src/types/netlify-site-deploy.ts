export type NetlifySiteDeploy = {
  id: string;
  state: string;
  branch: string | null;
  context: string | null;
  deployUrl: string | null;
  createdAt: string | null;
  publishedAt: string | null;
};

export type NetlifySiteDeployResult = {
  deploy: NetlifySiteDeploy;
};
