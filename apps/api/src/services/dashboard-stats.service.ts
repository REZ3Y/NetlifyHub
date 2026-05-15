import { prisma } from '../db/prisma.js';
import { getTelegramNotificationSettings } from './telegram-settings.service.js';

export type DashboardStatsDto = {
  linkedAccountsCount: number;
  sitesCount: number;
  timezone: string;
  proxyEnabled: boolean;
  telegramAlertsEnabled: boolean;
};

export async function getDashboardStats(userId: string): Promise<DashboardStatsDto> {
  const [linkedAccountsCount, sitesAgg, user, telegram] = await Promise.all([
    prisma.netlifyLinkedAccount.count({ where: { userId } }),
    prisma.netlifyLinkedAccount.aggregate({
      where: { userId },
      _sum: { siteCount: true },
    }),
    prisma.user.findUnique({
      where: { id: userId },
      select: { timezone: true, proxyEnabled: true },
    }),
    getTelegramNotificationSettings(),
  ]);

  return {
    linkedAccountsCount,
    sitesCount: sitesAgg._sum.siteCount ?? 0,
    timezone: user?.timezone ?? 'UTC',
    proxyEnabled: user?.proxyEnabled ?? false,
    telegramAlertsEnabled: telegram.enabled,
  };
}
