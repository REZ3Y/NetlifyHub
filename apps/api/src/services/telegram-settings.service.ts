import { Role } from '@prisma/client';
import { prisma } from '../db/prisma.js';
import { decryptSecret, encryptSecret } from '../lib/token-crypto.js';
import type { Env } from '../config/env.js';

const SETTINGS_ID = 'singleton';

export type TelegramNotificationSettingsDto = {
  enabled: boolean;
  hasBotToken: boolean;
  recipientChatIds: string[];
  bandwidthThresholdPercent: number;
  creditThresholdPercent: number;
  updatedAt: string;
};

function parseRecipientIds(json: string): string[] {
  try {
    const parsed = JSON.parse(json) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((v) => (typeof v === 'string' || typeof v === 'number' ? String(v).trim() : ''))
      .filter((id) => id.length > 0);
  } catch {
    return [];
  }
}

function serializeRecipientIds(ids: string[]): string {
  const unique = [...new Set(ids.map((id) => id.trim()).filter((id) => id.length > 0))];
  return JSON.stringify(unique);
}

function clampPercent(n: number): number {
  return Math.min(100, Math.max(1, Math.round(n)));
}

function toDto(row: {
  enabled: boolean;
  botTokenEncrypted: string | null;
  recipientChatIdsJson: string;
  bandwidthThresholdPercent: number;
  creditThresholdPercent: number;
  updatedAt: Date;
}): TelegramNotificationSettingsDto {
  return {
    enabled: row.enabled,
    hasBotToken: !!row.botTokenEncrypted,
    recipientChatIds: parseRecipientIds(row.recipientChatIdsJson),
    bandwidthThresholdPercent: row.bandwidthThresholdPercent,
    creditThresholdPercent: row.creditThresholdPercent,
    updatedAt: row.updatedAt.toISOString(),
  };
}

async function ensureSettingsRow() {
  return prisma.telegramNotificationSettings.upsert({
    where: { id: SETTINGS_ID },
    create: {
      id: SETTINGS_ID,
      enabled: false,
      recipientChatIdsJson: '[]',
      bandwidthThresholdPercent: 80,
      creditThresholdPercent: 80,
    },
    update: {},
  });
}

export async function getTelegramNotificationSettings(): Promise<TelegramNotificationSettingsDto> {
  const row = await ensureSettingsRow();
  return toDto(row);
}

export async function getTelegramSettingsForWorker(): Promise<{
  enabled: boolean;
  botTokenEncrypted: string;
  proxyUserId: string | null;
  recipientChatIds: string[];
  bandwidthThresholdPercent: number;
  creditThresholdPercent: number;
} | null> {
  const row = await ensureSettingsRow();
  if (!row.enabled || !row.botTokenEncrypted) return null;
  const recipientChatIds = parseRecipientIds(row.recipientChatIdsJson);
  if (!recipientChatIds.length) return null;
  return {
    enabled: row.enabled,
    botTokenEncrypted: row.botTokenEncrypted,
    proxyUserId: row.proxyUserId,
    recipientChatIds,
    bandwidthThresholdPercent: row.bandwidthThresholdPercent,
    creditThresholdPercent: row.creditThresholdPercent,
  };
}

export async function updateTelegramNotificationSettings(
  env: Env,
  adminUserId: string,
  input: {
    enabled?: boolean;
    botToken?: string | null;
    recipientChatIds?: string[];
    bandwidthThresholdPercent?: number;
    creditThresholdPercent?: number;
  }
): Promise<TelegramNotificationSettingsDto> {
  await ensureSettingsRow();

  const data: {
    enabled?: boolean;
    botTokenEncrypted?: string | null;
    recipientChatIdsJson?: string;
    bandwidthThresholdPercent?: number;
    creditThresholdPercent?: number;
    proxyUserId?: string;
  } = { proxyUserId: adminUserId };

  if (input.enabled !== undefined) data.enabled = input.enabled;
  if (input.recipientChatIds !== undefined) {
    data.recipientChatIdsJson = serializeRecipientIds(input.recipientChatIds);
  }
  if (input.bandwidthThresholdPercent !== undefined) {
    data.bandwidthThresholdPercent = clampPercent(input.bandwidthThresholdPercent);
  }
  if (input.creditThresholdPercent !== undefined) {
    data.creditThresholdPercent = clampPercent(input.creditThresholdPercent);
  }
  if (input.botToken !== undefined) {
    const trimmed = input.botToken?.trim() ?? '';
    if (trimmed === '') {
      data.botTokenEncrypted = null;
    } else {
      if (!env.TOKEN_ENCRYPTION_KEY || env.TOKEN_ENCRYPTION_KEY.length < 32) {
        throw new Error('TOKEN_ENCRYPTION_KEY is required to store the bot token.');
      }
      data.botTokenEncrypted = encryptSecret(trimmed, env.TOKEN_ENCRYPTION_KEY);
    }
  }

  const row = await prisma.telegramNotificationSettings.update({
    where: { id: SETTINGS_ID },
    data,
  });
  return toDto(row);
}

export async function resolveTelegramBotToken(env: Env, encrypted: string): Promise<string | null> {
  if (!env.TOKEN_ENCRYPTION_KEY || env.TOKEN_ENCRYPTION_KEY.length < 32) return null;
  try {
    return decryptSecret(encrypted, env.TOKEN_ENCRYPTION_KEY);
  } catch {
    return null;
  }
}

export async function resolveTelegramProxyUserId(
  settingsProxyUserId: string | null
): Promise<string | null> {
  if (settingsProxyUserId) return settingsProxyUserId;
  const admin = await prisma.user.findFirst({
    where: { role: Role.ADMIN },
    orderBy: { createdAt: 'asc' },
    select: { id: true },
  });
  return admin?.id ?? null;
}
