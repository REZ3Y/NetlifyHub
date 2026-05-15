import { TelegramNotificationStatus } from '@prisma/client';
import { prisma } from '../db/prisma.js';
import {
  TELEGRAM_ALERT_MAX_PER_ACCOUNT,
  TELEGRAM_ALERT_WINDOW_MS,
} from '../lib/telegram-queue-constants.js';

export type TelegramNotificationLogDto = {
  id: string;
  status: TelegramNotificationStatus;
  message: string;
  recipients: string[];
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

function toDto(row: {
  id: string;
  status: TelegramNotificationStatus;
  message: string;
  recipientsJson: string;
  linkedAccountId: string | null;
  accountLabel: string | null;
  teamSlug: string | null;
  quotaKind: string | null;
  usedPercent: number | null;
  errorMessage: string | null;
  sentAt: Date | null;
  createdAt: Date;
}): TelegramNotificationLogDto {
  return {
    id: row.id,
    status: row.status,
    message: row.message,
    recipients: parseRecipients(row.recipientsJson),
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

export async function createTelegramNotificationLog(input: {
  status: TelegramNotificationStatus;
  message: string;
  recipients: string[];
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
      linkedAccountId: input.linkedAccountId ?? null,
      accountLabel: input.accountLabel ?? null,
      teamSlug: input.teamSlug ?? null,
      quotaKind: input.quotaKind ?? null,
      usedPercent: input.usedPercent ?? null,
      errorMessage: input.errorMessage ?? null,
      sentAt: input.sentAt ?? null,
    },
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
