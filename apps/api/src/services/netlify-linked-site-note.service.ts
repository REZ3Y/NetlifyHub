import { prisma } from '../db/prisma.js';
import type { NetlifyLinkedSiteDto } from './netlify-account-sites.service.js';

export async function attachPanelNotesToSites(
  linkedAccountId: string,
  sites: NetlifyLinkedSiteDto[]
): Promise<NetlifyLinkedSiteDto[]> {
  if (!sites.length) return sites;

  const rows = await prisma.netlifyLinkedSiteNote.findMany({
    where: {
      linkedAccountId,
      netlifySiteId: { in: sites.map((s) => s.id) },
    },
    select: { netlifySiteId: true, note: true },
  });

  const bySiteId = new Map(rows.map((r) => [r.netlifySiteId, r.note.trim()]));

  return sites.map((site) => {
    const note = bySiteId.get(site.id);
    return { ...site, panelNote: note && note.length > 0 ? note : null };
  });
}

export async function upsertLinkedSitePanelNote(
  userId: string,
  linkedAccountId: string,
  netlifySiteId: string,
  note: string | null
): Promise<{ panelNote: string | null } | null> {
  const account = await prisma.netlifyLinkedAccount.findFirst({
    where: { id: linkedAccountId, userId },
    select: { id: true },
  });
  if (!account) return null;

  const trimmed = note?.trim() ?? '';
  if (!trimmed) {
    await prisma.netlifyLinkedSiteNote.deleteMany({
      where: { linkedAccountId, netlifySiteId },
    });
    return { panelNote: null };
  }

  const row = await prisma.netlifyLinkedSiteNote.upsert({
    where: {
      linkedAccountId_netlifySiteId: { linkedAccountId, netlifySiteId },
    },
    create: { linkedAccountId, netlifySiteId, note: trimmed },
    update: { note: trimmed },
    select: { note: true },
  });

  return { panelNote: row.note };
}
