import { prisma } from '../db/prisma.js';
import {
  DEFAULT_NETLIFY_CACHE_TTL_MINUTES,
  MAX_NETLIFY_CACHE_TTL_MINUTES,
  MIN_NETLIFY_CACHE_TTL_MINUTES,
} from '../lib/netlify-cache-constants.js';
import { invalidateAllNetlifyApiCaches } from '../lib/netlify-api-cache-registry.js';

const SETTINGS_ID = 'singleton';

type SettingsCache = { ttlMs: number; loadedAt: number };

let settingsCache: SettingsCache | null = null;
const SETTINGS_META_TTL_MS = 10_000;

export type PanelSettingsDto = {
  netlifyCacheTtlMinutes: number;
  updatedAt: string;
};

async function loadSettingsRow() {
  return prisma.panelSettings.upsert({
    where: { id: SETTINGS_ID },
    create: { id: SETTINGS_ID, netlifyCacheTtlMinutes: DEFAULT_NETLIFY_CACHE_TTL_MINUTES },
    update: {},
    select: { netlifyCacheTtlMinutes: true, updatedAt: true },
  });
}

function clampMinutes(minutes: number): number {
  return Math.min(MAX_NETLIFY_CACHE_TTL_MINUTES, Math.max(MIN_NETLIFY_CACHE_TTL_MINUTES, minutes));
}

export function invalidatePanelSettingsCache(): void {
  settingsCache = null;
}

export async function getNetlifyCacheTtlMs(): Promise<number> {
  const now = Date.now();
  if (settingsCache && now - settingsCache.loadedAt < SETTINGS_META_TTL_MS) {
    return settingsCache.ttlMs;
  }
  const row = await loadSettingsRow();
  const minutes = clampMinutes(row.netlifyCacheTtlMinutes);
  const ttlMs = minutes * 60 * 1000;
  settingsCache = { ttlMs, loadedAt: now };
  return ttlMs;
}

export async function getPanelSettings(): Promise<PanelSettingsDto> {
  const row = await loadSettingsRow();
  return {
    netlifyCacheTtlMinutes: clampMinutes(row.netlifyCacheTtlMinutes),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function updatePanelSettings(input: {
  netlifyCacheTtlMinutes: number;
}): Promise<PanelSettingsDto> {
  const minutes = clampMinutes(input.netlifyCacheTtlMinutes);
  const row = await prisma.panelSettings.update({
    where: { id: SETTINGS_ID },
    data: { netlifyCacheTtlMinutes: minutes },
    select: { netlifyCacheTtlMinutes: true, updatedAt: true },
  });
  invalidatePanelSettingsCache();
  invalidateAllNetlifyApiCaches();
  return {
    netlifyCacheTtlMinutes: row.netlifyCacheTtlMinutes,
    updatedAt: row.updatedAt.toISOString(),
  };
}
