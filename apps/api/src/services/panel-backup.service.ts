import { Role } from '@prisma/client';
import { z } from 'zod';
import type { Env } from '../config/env.js';
import { prisma } from '../db/prisma.js';
import {
  deleteArtifactFile,
  isZipFilename,
  MAX_DEPLOY_ZIP_BYTES,
  readArtifactZip,
  saveArtifactZip,
} from '../lib/upload-storage.js';
import { invalidateAllNetlifyApiCaches } from '../lib/netlify-api-cache-registry.js';
import { invalidatePanelSettingsCache } from './panel-settings.service.js';
import { invalidateLinkedNetlifyAccountSitesCache } from './netlify-account-sites.service.js';
import { invalidateLinkedNetlifyAccountUsageCache } from './netlify-account-usage.service.js';

export const PANEL_BACKUP_VERSION_V1 = 1 as const;
export const PANEL_BACKUP_VERSION_V2 = 2 as const;

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

const userSettingsSchema = z.object({
  timezone: z.string().min(1).max(128),
  proxyEnabled: z.boolean(),
  proxyType: z.enum(['http', 'socks5']).nullable(),
  proxyHost: z.string().max(253).nullable(),
  proxyPort: z.number().int().min(1).max(65535).nullable(),
  proxyUsername: z.string().max(256).nullable(),
  proxyPasswordEncrypted: z.string().nullable(),
});

const deployArtifactSchema = z.object({
  title: z.string().min(1).max(128),
  originalFilename: z.string().min(1).max(255),
  sizeBytes: z.number().int().min(0),
  createdAt: z.string().max(64).optional(),
  updatedAt: z.string().max(64).optional(),
  zipBase64: z.string().min(1),
});

const panelSettingsBackupSchema = z.object({
  netlifyCacheTtlMinutes: z.number().int().min(1).max(1440),
});

const telegramSettingsBackupSchema = z.object({
  enabled: z.boolean(),
  botTokenEncrypted: z.string().nullable(),
  recipientChatIds: z.array(z.string().min(1).max(64)),
  bandwidthThresholdPercent: z.number().int().min(1).max(100),
  creditThresholdPercent: z.number().int().min(1).max(100),
});

export const panelBackupV1Schema = z.object({
  version: z.literal(PANEL_BACKUP_VERSION_V1),
  exportedAt: z.string().min(1).max(64),
  settings: userSettingsSchema,
  netlifyLinkedAccounts: z.array(linkedAccountSchema),
});

export const panelBackupV2Schema = panelBackupV1Schema.extend({
  version: z.literal(PANEL_BACKUP_VERSION_V2),
  deployArtifacts: z.array(deployArtifactSchema).default([]),
  panelSettings: panelSettingsBackupSchema.optional(),
  telegramNotificationSettings: telegramSettingsBackupSchema.optional(),
});

export const panelBackupSchema = z.discriminatedUnion('version', [
  panelBackupV1Schema,
  panelBackupV2Schema,
]);

export type PanelBackupV2 = z.infer<typeof panelBackupV2Schema>;

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

async function deleteAllUserDeployArtifacts(env: Env, userId: string): Promise<void> {
  const rows = await prisma.panelDeployArtifact.findMany({
    where: { userId },
    select: { id: true, storagePath: true },
  });
  for (const row of rows) {
    await prisma.panelDeployArtifact.delete({ where: { id: row.id } });
    await deleteArtifactFile(env, row.storagePath);
  }
}

async function restoreDeployArtifacts(
  env: Env,
  userId: string,
  artifacts: z.infer<typeof deployArtifactSchema>[]
): Promise<number> {
  let restored = 0;
  for (const art of artifacts) {
    if (!isZipFilename(art.originalFilename)) continue;
    let zip: Uint8Array;
    try {
      const buf = Buffer.from(art.zipBase64, 'base64');
      zip = new Uint8Array(buf);
    } catch {
      continue;
    }
    if (zip.byteLength === 0 || zip.byteLength > MAX_DEPLOY_ZIP_BYTES) continue;

    const title = art.title.trim();
    if (!title) continue;

    const row = await prisma.panelDeployArtifact.create({
      data: {
        userId,
        title,
        originalFilename: art.originalFilename.trim(),
        storagePath: 'pending',
        sizeBytes: zip.byteLength,
        ...(art.createdAt ? { createdAt: new Date(art.createdAt) } : {}),
        ...(art.updatedAt ? { updatedAt: new Date(art.updatedAt) } : {}),
      },
      select: { id: true },
    });

    try {
      const storagePath = await saveArtifactZip(env, userId, row.id, zip);
      await prisma.panelDeployArtifact.update({
        where: { id: row.id },
        data: { storagePath, sizeBytes: zip.byteLength },
      });
      restored += 1;
    } catch {
      await prisma.panelDeployArtifact.delete({ where: { id: row.id } }).catch(() => undefined);
    }
  }
  return restored;
}

export async function exportPanelBackup(
  env: Env,
  userId: string,
  role: Role
): Promise<PanelBackupV2> {
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
      deployArtifacts: {
        orderBy: { createdAt: 'asc' },
      },
    },
  });

  const deployArtifacts: z.infer<typeof deployArtifactSchema>[] = [];
  for (const art of user.deployArtifacts) {
    try {
      const bytes = await readArtifactZip(env, art.storagePath);
      deployArtifacts.push({
        title: art.title,
        originalFilename: art.originalFilename,
        sizeBytes: art.sizeBytes,
        createdAt: art.createdAt.toISOString(),
        updatedAt: art.updatedAt.toISOString(),
        zipBase64: Buffer.from(bytes).toString('base64'),
      });
    } catch {
      // Skip artifacts whose zip file is missing on disk.
    }
  }

  let panelSettings: PanelBackupV2['panelSettings'];
  let telegramNotificationSettings: PanelBackupV2['telegramNotificationSettings'];

  if (role === Role.ADMIN) {
    const panelRow = await prisma.panelSettings.findUnique({ where: { id: 'singleton' } });
    if (panelRow) {
      panelSettings = { netlifyCacheTtlMinutes: panelRow.netlifyCacheTtlMinutes };
    }

    const telegramRow = await prisma.telegramNotificationSettings.findUnique({
      where: { id: 'singleton' },
    });
    if (telegramRow) {
      telegramNotificationSettings = {
        enabled: telegramRow.enabled,
        botTokenEncrypted: telegramRow.botTokenEncrypted,
        recipientChatIds: parseRecipientIds(telegramRow.recipientChatIdsJson),
        bandwidthThresholdPercent: telegramRow.bandwidthThresholdPercent,
        creditThresholdPercent: telegramRow.creditThresholdPercent,
      };
    }
  }

  return {
    version: PANEL_BACKUP_VERSION_V2,
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
    deployArtifacts,
    panelSettings,
    telegramNotificationSettings,
  };
}

export type RestorePanelBackupResult =
  | {
      ok: true;
      accountsRestored: number;
      notesRestored: number;
      artifactsRestored: number;
      panelSettingsRestored: boolean;
      telegramSettingsRestored: boolean;
    }
  | { ok: false; error: string; message: string };

function validateProxySettings(settings: z.infer<typeof userSettingsSchema>): string | null {
  if (!settings.proxyEnabled) return null;
  if (settings.proxyType !== 'http' && settings.proxyType !== 'socks5') {
    return 'Backup proxyType must be http or socks5 when proxy is enabled.';
  }
  if (!settings.proxyHost?.trim() || settings.proxyPort === null) {
    return 'Backup proxy host and port are required when proxy is enabled.';
  }
  return null;
}

export async function restorePanelBackup(
  env: Env,
  userId: string,
  role: Role,
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

  const proxyError = validateProxySettings(settings);
  if (proxyError) {
    return { ok: false, error: 'VALIDATION_ERROR', message: proxyError };
  }

  const existingIds = await prisma.netlifyLinkedAccount.findMany({
    where: { userId },
    select: { id: true },
  });

  const deployArtifacts = backup.version === PANEL_BACKUP_VERSION_V2 ? backup.deployArtifacts : [];

  let notesRestored = 0;
  let artifactsRestored = 0;
  let panelSettingsRestored = false;
  let telegramSettingsRestored = false;

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

    if (role === Role.ADMIN && backup.version === PANEL_BACKUP_VERSION_V2) {
      if (backup.panelSettings) {
        await tx.panelSettings.upsert({
          where: { id: 'singleton' },
          create: {
            id: 'singleton',
            netlifyCacheTtlMinutes: backup.panelSettings.netlifyCacheTtlMinutes,
          },
          update: {
            netlifyCacheTtlMinutes: backup.panelSettings.netlifyCacheTtlMinutes,
          },
        });
        panelSettingsRestored = true;
      }

      if (backup.telegramNotificationSettings) {
        const tg = backup.telegramNotificationSettings;
        await tx.telegramNotificationSettings.upsert({
          where: { id: 'singleton' },
          create: {
            id: 'singleton',
            enabled: tg.enabled,
            botTokenEncrypted: tg.botTokenEncrypted,
            recipientChatIdsJson: serializeRecipientIds(tg.recipientChatIds),
            bandwidthThresholdPercent: tg.bandwidthThresholdPercent,
            creditThresholdPercent: tg.creditThresholdPercent,
            proxyUserId: userId,
          },
          update: {
            enabled: tg.enabled,
            botTokenEncrypted: tg.botTokenEncrypted,
            recipientChatIdsJson: serializeRecipientIds(tg.recipientChatIds),
            bandwidthThresholdPercent: tg.bandwidthThresholdPercent,
            creditThresholdPercent: tg.creditThresholdPercent,
            proxyUserId: userId,
          },
        });
        telegramSettingsRestored = true;
      }
    }
  });

  await deleteAllUserDeployArtifacts(env, userId);
  if (deployArtifacts.length) {
    artifactsRestored = await restoreDeployArtifacts(env, userId, deployArtifacts);
  }

  if (panelSettingsRestored) {
    invalidatePanelSettingsCache();
    invalidateAllNetlifyApiCaches();
  }

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
    artifactsRestored,
    panelSettingsRestored,
    telegramSettingsRestored,
  };
}
