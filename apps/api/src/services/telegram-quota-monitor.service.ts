import { TelegramNotificationStatus } from '@prisma/client';
import type { Env } from '../config/env.js';
import { prisma } from '../db/prisma.js';
import { fetchLinkedNetlifyAccountUsage } from './netlify-account-usage.service.js';
import {
  createTelegramNotificationLog,
  shouldSkipAccountDueToRateLimit,
} from './telegram-notification-log.service.js';
import {
  getTelegramSettingsForWorker,
  resolveTelegramBotToken,
} from './telegram-settings.service.js';
import { sendTelegramMessage } from './telegram-send.service.js';

type QuotaCheck = {
  kind: 'bandwidth' | 'credits';
  used: number;
  included: number;
  usedLabel: string;
  includedLabel: string;
  thresholdPercent: number;
};

function usagePercent(used: number, included: number): number | null {
  if (!Number.isFinite(used) || !Number.isFinite(included) || included <= 0) return null;
  return Math.round((used / included) * 1000) / 10;
}

function pickQuotaCheck(
  usage: {
    credits: { used: number; included: number; usedLabel: string; includedLabel: string } | null;
    bandwidth: { used: number; included: number; usedLabel: string; includedLabel: string } | null;
  },
  bandwidthThresholdPercent: number,
  creditThresholdPercent: number
): QuotaCheck | null {
  if (usage.credits && usage.credits.included > 0) {
    return {
      kind: 'credits',
      used: usage.credits.used,
      included: usage.credits.included,
      usedLabel: usage.credits.usedLabel,
      includedLabel: usage.credits.includedLabel,
      thresholdPercent: creditThresholdPercent,
    };
  }
  if (usage.bandwidth && usage.bandwidth.included > 0) {
    return {
      kind: 'bandwidth',
      used: usage.bandwidth.used,
      included: usage.bandwidth.included,
      usedLabel: usage.bandwidth.usedLabel,
      includedLabel: usage.bandwidth.includedLabel,
      thresholdPercent: bandwidthThresholdPercent,
    };
  }
  return null;
}

function buildAlertMessage(input: {
  accountLabel: string;
  email: string | null;
  teamName: string;
  teamSlug: string;
  planName: string | null;
  check: QuotaCheck;
  percent: number;
}): string {
  const quotaName = input.check.kind === 'credits' ? 'Credits' : 'Bandwidth';
  const lines = [
    '⚠️ Netlify quota alert',
    '',
    `Account: ${input.accountLabel}`,
    input.email ? `Email: ${input.email}` : null,
    `Team: ${input.teamName} (${input.teamSlug})`,
    input.planName ? `Plan: ${input.planName}` : null,
    '',
    `${quotaName}: ${input.check.usedLabel} / ${input.check.includedLabel}`,
    `Usage: ${input.percent}% (threshold: ${input.check.thresholdPercent}%)`,
    '',
    'Usage has reached or exceeded the configured threshold in NetlifyHub.',
  ].filter((line): line is string => line !== null);
  return lines.join('\n');
}

export type TelegramQuotaMonitorResult = {
  checked: number;
  alerted: number;
  skipped: number;
  failed: number;
};

export async function runTelegramQuotaMonitor(env: Env): Promise<TelegramQuotaMonitorResult> {
  const settings = await getTelegramSettingsForWorker();
  if (!settings) {
    return { checked: 0, alerted: 0, skipped: 0, failed: 0 };
  }

  const botToken = await resolveTelegramBotToken(env, settings.botTokenEncrypted);
  if (!botToken) {
    return { checked: 0, alerted: 0, skipped: 0, failed: 0 };
  }

  const accounts = await prisma.netlifyLinkedAccount.findMany({
    where: { enabled: true },
    select: {
      id: true,
      userId: true,
      label: true,
      email: true,
      fullName: true,
    },
  });

  const result: TelegramQuotaMonitorResult = {
    checked: accounts.length,
    alerted: 0,
    skipped: 0,
    failed: 0,
  };

  for (const account of accounts) {
    const accountLabel =
      account.label?.trim() || account.fullName?.trim() || account.email?.trim() || account.id;

    const usageResult = await fetchLinkedNetlifyAccountUsage(env, account.userId, account.id, {
      refresh: true,
    });

    if (!usageResult.ok) {
      result.failed += 1;
      await createTelegramNotificationLog({
        status: TelegramNotificationStatus.FAILED,
        message: `Could not load usage for ${accountLabel}.`,
        recipients: settings.recipientChatIds,
        linkedAccountId: account.id,
        accountLabel,
        errorMessage: usageResult.message,
      });
      continue;
    }

    const check = pickQuotaCheck(
      usageResult.usage,
      settings.bandwidthThresholdPercent,
      settings.creditThresholdPercent
    );
    if (!check) continue;

    const percent = usagePercent(check.used, check.included);
    if (percent === null || percent < check.thresholdPercent) continue;

    const message = buildAlertMessage({
      accountLabel,
      email: account.email,
      teamName: usageResult.usage.teamName,
      teamSlug: usageResult.usage.teamSlug,
      planName: usageResult.usage.planName,
      check,
      percent,
    });

    if (await shouldSkipAccountDueToRateLimit(account.id)) {
      result.skipped += 1;
      await createTelegramNotificationLog({
        status: TelegramNotificationStatus.SKIPPED,
        message,
        recipients: settings.recipientChatIds,
        linkedAccountId: account.id,
        accountLabel,
        teamSlug: usageResult.usage.teamSlug,
        quotaKind: check.kind,
        usedPercent: percent,
        errorMessage: 'Rate limit: 3 alerts per account in the last 7 days.',
      });
      continue;
    }

    let anySent = false;
    let lastError: string | null = null;
    for (const chatId of settings.recipientChatIds) {
      const sent = await sendTelegramMessage(
        env,
        settings.botTokenEncrypted,
        settings.proxyUserId,
        chatId,
        message
      );
      if (sent.ok) {
        anySent = true;
      } else {
        lastError = sent.error;
      }
    }

    if (anySent) {
      result.alerted += 1;
      await createTelegramNotificationLog({
        status: TelegramNotificationStatus.SENT,
        message,
        recipients: settings.recipientChatIds,
        linkedAccountId: account.id,
        accountLabel,
        teamSlug: usageResult.usage.teamSlug,
        quotaKind: check.kind,
        usedPercent: percent,
        sentAt: new Date(),
      });
    } else {
      result.failed += 1;
      await createTelegramNotificationLog({
        status: TelegramNotificationStatus.FAILED,
        message,
        recipients: settings.recipientChatIds,
        linkedAccountId: account.id,
        accountLabel,
        teamSlug: usageResult.usage.teamSlug,
        quotaKind: check.kind,
        usedPercent: percent,
        errorMessage: lastError ?? 'Telegram send failed for all recipients.',
      });
    }
  }

  return result;
}
