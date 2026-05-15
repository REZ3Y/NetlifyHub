import { TelegramNotificationStatus } from '@prisma/client';
import { prisma } from '../db/prisma.js';
import {
  TELEGRAM_ALERT_MAX_PER_ACCOUNT,
  TELEGRAM_ALERT_WINDOW_MS,
  TELEGRAM_RATE_LIMIT_SKIP_MESSAGE,
} from '../lib/telegram-queue-constants.js';

export { TELEGRAM_RATE_LIMIT_SKIP_MESSAGE };

export type TelegramDeliveryResultDto = {
  chatId: string;
  ok: boolean;
  error?: string;
};

export type TelegramNotificationLogDto = {
  id: string;
  status: TelegramNotificationStatus;
  message: string;
  recipients: string[];
  deliveryResults: TelegramDeliveryResultDto[];
  linkedAccountId: string | null;
  accountLabel: string | null;
  teamSlug: string | null;
  quotaKind: string | null;
  usedPercent: number | null;
  errorMessage: string | null;
  sentAt: string | null;
  createdAt: string;
};

function parseRecipients(json: string): string[] {
  try {
    const parsed = JSON.parse(json) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.map((v) => String(v));
  } catch {
    return [];
  }
}

function parseDeliveryResults(json: string | null | undefined): TelegramDeliveryResultDto[] | null {
  if (!json) return null;
  try {
    const parsed = JSON.parse(json) as unknown;
    if (!Array.isArray(parsed)) return null;
    const out: TelegramDeliveryResultDto[] = [];
    for (const item of parsed) {
      if (!item || typeof item !== 'object') continue;
      const o = item as { chatId?: unknown; ok?: unknown; error?: unknown };
      const chatId =
        typeof o.chatId === 'string' || typeof o.chatId === 'number' ? String(o.chatId) : '';
      if (!chatId) continue;
      out.push({
        chatId,
        ok: o.ok === true,
        error: typeof o.error === 'string' && o.error.trim() ? o.error.trim() : undefined,
      });
    }
    return out.length ? out : null;
  } catch {
    return null;
  }
}

function inferDeliveryResults(
  status: TelegramNotificationStatus,
  recipients: string[],
  errorMessage: string | null
): TelegramDeliveryResultDto[] {
  if (!recipients.length) return [];
  const err =
    errorMessage?.trim() ||
    (status === TelegramNotificationStatus.SKIPPED ? 'Skipped' : 'Delivery failed');
  if (status === TelegramNotificationStatus.SENT) {
    return recipients.map((chatId) => ({ chatId, ok: true }));
  }
  return recipients.map((chatId) => ({ chatId, ok: false, error: err }));
}

function toDto(row: {
  id: string;
  status: TelegramNotificationStatus;
  message: string;
  recipientsJson: string;
  deliveryResultsJson?: string | null;
  linkedAccountId: string | null;
  accountLabel: string | null;
  teamSlug: string | null;
  quotaKind: string | null;
  usedPercent: number | null;
  errorMessage: string | null;
  sentAt: Date | null;
  createdAt: Date;
}): TelegramNotificationLogDto {
  const recipients = parseRecipients(row.recipientsJson);
  const deliveryResults =
    parseDeliveryResults(row.deliveryResultsJson ?? null) ??
    inferDeliveryResults(row.status, recipients, row.errorMessage);

  return {
    id: row.id,
    status: row.status,
    message: row.message,
    recipients,
    deliveryResults,
    linkedAccountId: row.linkedAccountId,
    accountLabel: row.accountLabel,
    teamSlug: row.teamSlug,
    quotaKind: row.quotaKind,
    usedPercent: row.usedPercent,
    errorMessage: row.errorMessage,
    sentAt: row.sentAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
  };
}

export async function countRecentSentAlertsForAccount(linkedAccountId: string): Promise<number> {
  const since = new Date(Date.now() - TELEGRAM_ALERT_WINDOW_MS);
  return prisma.telegramNotificationLog.count({
    where: {
      linkedAccountId,
      status: TelegramNotificationStatus.SENT,
      createdAt: { gte: since },
    },
  });
}

export async function shouldSkipAccountDueToRateLimit(linkedAccountId: string): Promise<boolean> {
  const count = await countRecentSentAlertsForAccount(linkedAccountId);
  return count >= TELEGRAM_ALERT_MAX_PER_ACCOUNT;
}

/** Whether a rate-limit SKIPPED log was already recorded for this account in the rolling window. */
export async function hasRecentRateLimitSkipLog(linkedAccountId: string): Promise<boolean> {
  const since = new Date(Date.now() - TELEGRAM_ALERT_WINDOW_MS);
  const count = await prisma.telegramNotificationLog.count({
    where: {
      linkedAccountId,
      status: TelegramNotificationStatus.SKIPPED,
      errorMessage: TELEGRAM_RATE_LIMIT_SKIP_MESSAGE,
      createdAt: { gte: since },
    },
  });
  return count > 0;
}

export async function createTelegramNotificationLog(input: {
  status: TelegramNotificationStatus;
  message: string;
  recipients: string[];
  deliveryResults?: TelegramDeliveryResultDto[];
  linkedAccountId?: string | null;
  accountLabel?: string | null;
  teamSlug?: string | null;
  quotaKind?: string | null;
  usedPercent?: number | null;
  errorMessage?: string | null;
  sentAt?: Date | null;
}) {
  return prisma.telegramNotificationLog.create({
    data: {
      status: input.status,
      message: input.message,
      recipientsJson: JSON.stringify(input.recipients),
      deliveryResultsJson: input.deliveryResults?.length
        ? JSON.stringify(input.deliveryResults)
        : null,
      linkedAccountId: input.linkedAccountId ?? null,
      accountLabel: input.accountLabel ?? null,
      teamSlug: input.teamSlug ?? null,
      quotaKind: input.quotaKind ?? null,
      usedPercent: input.usedPercent ?? null,
      errorMessage: input.errorMessage ?? null,
      sentAt: input.sentAt ?? null,
    } as Parameters<typeof prisma.telegramNotificationLog.create>[0]['data'],
  });
}

export async function listTelegramNotificationLogs(
  page: number,
  pageSize: number
): Promise<{ logs: TelegramNotificationLogDto[]; total: number; page: number; pageSize: number }> {
  const safePage = Math.max(1, page);
  const safeSize = Math.min(100, Math.max(1, pageSize));
  const skip = (safePage - 1) * safeSize;

  const [rows, total] = await Promise.all([
    prisma.telegramNotificationLog.findMany({
      orderBy: { createdAt: 'desc' },
      skip,
      take: safeSize,
    }),
    prisma.telegramNotificationLog.count(),
  ]);

  return {
    logs: rows.map(toDto),
    total,
    page: safePage,
    pageSize: safeSize,
  };
}
