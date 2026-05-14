import { fetch as undiciFetch, ProxyAgent } from 'undici';
import { socksDispatcher } from 'fetch-socks';
import { prisma } from '../db/prisma.js';
import type { Env } from '../config/env.js';
import { decryptSecret } from './token-crypto.js';

function globalFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  return globalThis.fetch(input, init);
}

function asFetch(
  fn: (input: RequestInfo | URL, init?: RequestInit) => ReturnType<typeof undiciFetch>
): typeof fetch {
  return fn as unknown as typeof fetch;
}

/**
 * Returns `fetch` that routes HTTPS to Netlify through the user's outbound proxy when enabled.
 */
export async function createNetlifyFetchForUser(env: Env, userId: string): Promise<typeof fetch> {
  const u = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      proxyEnabled: true,
      proxyType: true,
      proxyHost: true,
      proxyPort: true,
      proxyUsername: true,
      proxyPasswordEncrypted: true,
    },
  });
  if (!u?.proxyEnabled || !u.proxyType) {
    return globalFetch;
  }
  const host = (u.proxyHost ?? '').trim();
  const port = u.proxyPort;
  if (!host || port === null || port < 1 || port > 65535) {
    return globalFetch;
  }

  let proxyPassword = '';
  if (
    u.proxyPasswordEncrypted &&
    env.TOKEN_ENCRYPTION_KEY &&
    env.TOKEN_ENCRYPTION_KEY.length >= 32
  ) {
    try {
      proxyPassword = decryptSecret(u.proxyPasswordEncrypted, env.TOKEN_ENCRYPTION_KEY);
    } catch {
      proxyPassword = '';
    }
  }
  const proxyUser = (u.proxyUsername ?? '').trim();

  if (u.proxyType === 'socks5') {
    const socks = {
      type: 5 as const,
      host,
      port,
      ...(proxyUser ? { userId: proxyUser } : {}),
      ...(proxyPassword ? { password: proxyPassword } : {}),
    };
    const dispatcher = socksDispatcher(socks);
    return asFetch((input, init) =>
      undiciFetch(
        input as Parameters<typeof undiciFetch>[0],
        {
          ...(init as Record<string, unknown>),
          dispatcher,
        } as unknown as Parameters<typeof undiciFetch>[1]
      )
    );
  }

  if (u.proxyType === 'http') {
    let uri: string;
    if (proxyUser || proxyPassword) {
      const ue = encodeURIComponent(proxyUser);
      const pe = encodeURIComponent(proxyPassword);
      uri = `http://${ue}:${pe}@${host}:${port}`;
    } else {
      uri = `http://${host}:${port}`;
    }
    const dispatcher = new ProxyAgent(uri);
    return asFetch((input, init) =>
      undiciFetch(
        input as Parameters<typeof undiciFetch>[0],
        {
          ...(init as Record<string, unknown>),
          dispatcher,
        } as unknown as Parameters<typeof undiciFetch>[1]
      )
    );
  }

  return globalFetch;
}
