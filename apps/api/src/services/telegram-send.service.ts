import type { Env } from '../config/env.js';
import { createOutboundFetchForUser } from '../lib/outbound-proxied-fetch.js';
import {
  resolveTelegramBotToken,
  resolveTelegramProxyUserId,
} from './telegram-settings.service.js';

export async function sendTelegramMessage(
  env: Env,
  botTokenEncrypted: string,
  proxyUserId: string | null,
  chatId: string,
  text: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const botToken = await resolveTelegramBotToken(env, botTokenEncrypted);
  if (!botToken) {
    return { ok: false, error: 'Bot token could not be decrypted.' };
  }

  const userIdForProxy = await resolveTelegramProxyUserId(proxyUserId);
  const fetchImpl = userIdForProxy
    ? await createOutboundFetchForUser(env, userIdForProxy)
    : globalThis.fetch;

  const url = `https://api.telegram.org/bot${encodeURIComponent(botToken)}/sendMessage`;
  try {
    const res = await fetchImpl(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        disable_web_page_preview: true,
      }),
    });
    const body = (await res.json().catch(() => null)) as {
      ok?: boolean;
      description?: string;
    } | null;
    if (!res.ok || body?.ok === false) {
      return {
        ok: false,
        error: body?.description ?? `Telegram API HTTP ${res.status}`,
      };
    }
    return { ok: true };
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Telegram request failed';
    return { ok: false, error: msg };
  }
}
