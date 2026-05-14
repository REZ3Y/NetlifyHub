import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { prisma } from '../db/prisma.js';
import {
  authenticateRequest,
  clearSessionCookie,
  updatePassword,
  updateUsername,
} from '../services/auth.service.js';
import { encryptSecret } from '../lib/token-crypto.js';

function isValidIanaTimeZone(tz: string): boolean {
  try {
    Intl.DateTimeFormat(undefined, { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

const patchBody = z
  .object({
    username: z.string().min(1).max(64).optional(),
    currentPassword: z.string().min(1).max(256).optional(),
    newPassword: z.string().min(8).max(256).optional(),
    timezone: z
      .string()
      .min(1)
      .max(128)
      .refine(isValidIanaTimeZone, { message: 'Invalid IANA time zone' })
      .optional(),
    proxyEnabled: z.boolean().optional(),
    proxyType: z.enum(['http', 'socks5']).nullable().optional(),
    proxyHost: z.string().trim().max(253).nullable().optional(),
    proxyPort: z.number().int().min(1).max(65535).nullable().optional(),
    proxyUsername: z.string().max(256).nullable().optional(),
    /** Omit = unchanged; empty string = clear stored password. */
    proxyPassword: z.string().max(256).optional(),
  })
  .superRefine((b, ctx) => {
    if (b.newPassword && !b.currentPassword) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'currentPassword is required when changing password',
        path: ['currentPassword'],
      });
    }
  });

const meSelect = {
  id: true,
  username: true,
  role: true,
  timezone: true,
  createdAt: true,
  updatedAt: true,
  proxyEnabled: true,
  proxyType: true,
  proxyHost: true,
  proxyPort: true,
  proxyUsername: true,
  proxyPasswordEncrypted: true,
} as const;

type MeRow = {
  id: string;
  username: string;
  role: string;
  timezone: string;
  createdAt: Date;
  updatedAt: Date;
  proxyEnabled: boolean;
  proxyType: string | null;
  proxyHost: string | null;
  proxyPort: number | null;
  proxyUsername: string | null;
  proxyPasswordEncrypted: string | null;
};

function toMeResponse(row: MeRow) {
  return {
    id: row.id,
    username: row.username,
    role: row.role,
    timezone: row.timezone,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    proxyEnabled: row.proxyEnabled,
    proxyType: row.proxyType === 'http' || row.proxyType === 'socks5' ? row.proxyType : null,
    proxyHost: row.proxyHost,
    proxyPort: row.proxyPort,
    proxyUsername: row.proxyUsername,
    proxyHasPassword: !!row.proxyPasswordEncrypted,
  };
}

export const meRoutes: FastifyPluginAsync = async (app) => {
  const cfg = app.config;

  app.get('/', async (request, reply) => {
    const user = await authenticateRequest(request, reply);
    if (!user) return;
    const row = await prisma.user.findUnique({
      where: { id: user.id },
      select: meSelect,
    });
    if (!row) return reply.code(404).send({ error: 'NOT_FOUND', message: 'User not found' });
    return toMeResponse(row);
  });

  app.patch('/', async (request, reply) => {
    const user = await authenticateRequest(request, reply);
    if (!user) return;

    const parsed = patchBody.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({
        error: 'VALIDATION_ERROR',
        message: 'Invalid payload',
        details: parsed.error.flatten(),
      });
    }
    const body = parsed.data;

    let passwordChanged = false;

    if (body.username && body.username !== user.username) {
      const u = await updateUsername(user.id, body.username);
      if (!u.ok) {
        return reply.code(409).send({ error: u.error, message: u.message });
      }
    }

    if (body.newPassword && body.currentPassword) {
      const p = await updatePassword(user.id, body.currentPassword, body.newPassword, cfg);
      if (!p.ok) {
        return reply.code(400).send({ error: p.error, message: p.message });
      }
      passwordChanged = true;
      clearSessionCookie(reply, cfg);
    }

    if (body.timezone) {
      await prisma.user.update({
        where: { id: user.id },
        data: { timezone: body.timezone },
      });
    }

    const hasProxyPatch =
      body.proxyEnabled !== undefined ||
      body.proxyType !== undefined ||
      body.proxyHost !== undefined ||
      body.proxyPort !== undefined ||
      body.proxyUsername !== undefined ||
      body.proxyPassword !== undefined;

    if (hasProxyPatch) {
      const row = await prisma.user.findUniqueOrThrow({
        where: { id: user.id },
        select: {
          proxyEnabled: true,
          proxyType: true,
          proxyHost: true,
          proxyPort: true,
          proxyUsername: true,
          proxyPasswordEncrypted: true,
        },
      });

      const nextEnabled = body.proxyEnabled ?? row.proxyEnabled;
      const nextType =
        body.proxyType === undefined
          ? row.proxyType
          : body.proxyType === null
            ? null
            : body.proxyType;
      const nextHost =
        body.proxyHost === undefined
          ? row.proxyHost
          : body.proxyHost === null || body.proxyHost === ''
            ? null
            : body.proxyHost.trim();
      const nextPort = body.proxyPort === undefined ? row.proxyPort : body.proxyPort;
      const nextUsername =
        body.proxyUsername === undefined
          ? row.proxyUsername
          : body.proxyUsername === null || body.proxyUsername === ''
            ? null
            : body.proxyUsername.trim();

      let nextPasswordEnc = row.proxyPasswordEncrypted;
      if (body.proxyPassword !== undefined) {
        if (body.proxyPassword === '') {
          nextPasswordEnc = null;
        } else {
          if (!cfg.TOKEN_ENCRYPTION_KEY || cfg.TOKEN_ENCRYPTION_KEY.length < 32) {
            return reply.code(503).send({
              error: 'SERVER_MISCONFIGURED',
              message: 'TOKEN_ENCRYPTION_KEY (32+ chars) is required to store a proxy password.',
            });
          }
          nextPasswordEnc = encryptSecret(body.proxyPassword, cfg.TOKEN_ENCRYPTION_KEY);
        }
      }

      if (nextEnabled) {
        if (nextType !== 'http' && nextType !== 'socks5') {
          return reply.code(400).send({
            error: 'VALIDATION_ERROR',
            message: 'proxyType must be http or socks5 when proxy is enabled.',
          });
        }
        const h = (nextHost ?? '').trim();
        if (!h || nextPort === null || nextPort < 1 || nextPort > 65535) {
          return reply.code(400).send({
            error: 'VALIDATION_ERROR',
            message: 'proxyHost and proxyPort (1–65535) are required when proxy is enabled.',
          });
        }
      }

      await prisma.user.update({
        where: { id: user.id },
        data: {
          proxyEnabled: nextEnabled,
          proxyType: nextType,
          proxyHost: nextHost && nextHost.trim() ? nextHost.trim() : null,
          proxyPort: nextPort,
          proxyUsername: nextUsername,
          proxyPasswordEncrypted: nextPasswordEnc,
        },
      });
    }

    const out = await prisma.user.findUniqueOrThrow({
      where: { id: user.id },
      select: meSelect,
    });

    return passwordChanged
      ? { user: toMeResponse(out), mustReauth: true }
      : { user: toMeResponse(out) };
  });
};
