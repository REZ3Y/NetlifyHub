export type AuthUser = {
  id: string;
  username: string;
  role: string;
  timezone: string;
  createdAt?: string;
  updatedAt?: string;
  proxyEnabled?: boolean;
  proxyType?: 'http' | 'socks5' | null;
  proxyHost?: string | null;
  proxyPort?: number | null;
  proxyUsername?: string | null;
  /** Server does not return the password; only whether one is stored. */
  proxyHasPassword?: boolean;
};
