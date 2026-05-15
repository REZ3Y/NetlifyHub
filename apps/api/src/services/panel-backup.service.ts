import { z } from 'zod';
import { prisma } from '../db/prisma.js';
import { invalidateLinkedNetlifyAccountSitesCache } from './netlify-account-sites.service.js';
import { invalidateLinkedNetlifyAccountUsageCache } from './netlify-account-usage.service.js';

export const PANEL_BACKUP_VERSION = 1 as const;

const siteNoteSchema = z.object({
  netlifySiteId: z.string().min(1).max(128),
  note: z.string().min(1).max(512),
});

const linkedAccountSchema = z.object({
  label: z.string().max(128).nullable(),
  netlifyId: z.string().min(1).max(128),
  uid: z.string().min(1).max(128),
  fullName: z.string().max(256).nullable(),
  avatarUrl: z.string().max(2048).nullable(),
  email: z.string().max(256).nullable(),
  affiliateId: z.string().max(128).nullable(),
  siteCount: z.number().int().min(0),
  netlifyCreatedAt: z.string().max(64).nullable(),
  netlifyLastLogin: z.string().max(64).nullable(),
  tokenEncrypted: z.string().min(1),
  enabled: z.boolean(),
  siteNotes: z.array(siteNoteSchema).default([]),
});

export const panelBackupSchema = z.object({
  version: z.literal(PANEL_BACKUP_VERSION),
  exportedAt: z.string().min(1).max(64),
  settings: z.object({
    timezone: z.string().min(1).max(128),
    proxyEnabled: z.boolean(),
    proxyType: z.enum(['http', 'socks5']).nullable(),
    proxyHost: z.string().max(253).nullable(),
    proxyPort: z.number().int().min(1).max(65535).nullable(),
    proxyUsername: z.string().max(256).nullable(),
    proxyPasswordEncrypted: z.string().nullable(),
  }),
  netlifyLinkedAccounts: z.array(linkedAccountSchema),
});

export type PanelBackupV1 = z.infer<typeof panelBackupSchema>;

export async function exportPanelBackup(userId: string): Promise<PanelBackupV1> {
  const user = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    select: {
      timezone: true,
      proxyEnabled: true,
      proxyType: true,
      proxyHost: true,
      proxyPort: true,
      proxyUsername: true,
      proxyPasswordEncrypted: true,
      netlifyLinkedAccounts: {
        include: { siteNotes: true },
        orderBy: { createdAt: 'asc' },
      },
    },
  });

  return {
    version: PANEL_BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    settings: {
      timezone: user.timezone,
      proxyEnabled: user.proxyEnabled,
      proxyType: user.proxyType === 'http' || user.proxyType === 'socks5' ? user.proxyType : null,
      proxyHost: user.proxyHost,
      proxyPort: user.proxyPort,
      proxyUsername: user.proxyUsername,
      proxyPasswordEncrypted: user.proxyPasswordEncrypted,
    },
    netlifyLinkedAccounts: user.netlifyLinkedAccounts.map((a) => ({
      label: a.label,
      netlifyId: a.netlifyId,
      uid: a.uid,
      fullName: a.fullName,
      avatarUrl: a.avatarUrl,
      email: a.email,
      affiliateId: a.affiliateId,
      siteCount: a.siteCount,
      netlifyCreatedAt: a.netlifyCreatedAt,
      netlifyLastLogin: a.netlifyLastLogin,
      tokenEncrypted: a.tokenEncrypted,
      enabled: a.enabled,
      siteNotes: a.siteNotes.map((n) => ({
        netlifySiteId: n.netlifySiteId,
        note: n.note,
      })),
    })),
  };
}

export type RestorePanelBackupResult =
  | { ok: true; accountsRestored: number; notesRestored: number }
  | { ok: false; error: string; message: string };

export async function restorePanelBackup(
  userId: string,
  raw: unknown
): Promise<RestorePanelBackupResult> {
  const parsed = panelBackupSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      ok: false,
      error: 'INVALID_BACKUP',
      message: 'Backup file format is invalid or unsupported.',
    };
  }

  const backup = parsed.data;
  const { settings, netlifyLinkedAccounts } = backup;

  if (settings.proxyEnabled) {
    if (settings.proxyType !== 'http' && settings.proxyType !== 'socks5') {
      return {
        ok: false,
        error: 'VALIDATION_ERROR',
        message: 'Backup proxyType must be http or socks5 when proxy is enabled.',
      };
    }
    if (!settings.proxyHost?.trim() || settings.proxyPort === null) {
      return {
        ok: false,
        error: 'VALIDATION_ERROR',
        message: 'Backup proxy host and port are required when proxy is enabled.',
      };
    }
  }

  const existingIds = await prisma.netlifyLinkedAccount.findMany({
    where: { userId },
    select: { id: true },
  });

  let notesRestored = 0;

  await prisma.$transaction(async (tx) => {
    await tx.netlifyLinkedAccount.deleteMany({ where: { userId } });

    await tx.user.update({
      where: { id: userId },
      data: {
        timezone: settings.timezone,
        proxyEnabled: settings.proxyEnabled,
        proxyType: settings.proxyType,
        proxyHost: settings.proxyHost?.trim() || null,
        proxyPort: settings.proxyPort,
        proxyUsername: settings.proxyUsername?.trim() || null,
        proxyPasswordEncrypted: settings.proxyPasswordEncrypted,
      },
    });

    for (const account of netlifyLinkedAccounts) {
      const created = await tx.netlifyLinkedAccount.create({
        data: {
          userId,
          label: account.label,
          netlifyId: account.netlifyId,
          uid: account.uid,
          fullName: account.fullName,
          avatarUrl: account.avatarUrl,
          email: account.email,
          affiliateId: account.affiliateId,
          siteCount: account.siteCount,
          netlifyCreatedAt: account.netlifyCreatedAt,
          netlifyLastLogin: account.netlifyLastLogin,
          tokenEncrypted: account.tokenEncrypted,
          enabled: account.enabled,
        },
      });

      if (account.siteNotes.length) {
        await tx.netlifyLinkedSiteNote.createMany({
          data: account.siteNotes.map((n) => ({
            linkedAccountId: created.id,
            netlifySiteId: n.netlifySiteId,
            note: n.note,
          })),
        });
        notesRestored += account.siteNotes.length;
      }
    }
  });

  for (const row of existingIds) {
    invalidateLinkedNetlifyAccountSitesCache(userId, row.id);
    invalidateLinkedNetlifyAccountUsageCache(userId, row.id);
  }

  const newIds = await prisma.netlifyLinkedAccount.findMany({
    where: { userId },
    select: { id: true },
  });
  for (const row of newIds) {
    invalidateLinkedNetlifyAccountSitesCache(userId, row.id);
    invalidateLinkedNetlifyAccountUsageCache(userId, row.id);
  }

  return {
    ok: true,
    accountsRestored: netlifyLinkedAccounts.length,
    notesRestored,
  };
}
