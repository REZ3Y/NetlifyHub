import type { FastifyReply, FastifyRequest } from 'fastify';
import { SESSION_COOKIE_NAME } from '@netlifyhub/shared';
import type { Env } from '../config/env.js';
import { prisma } from '../db/prisma.js';
import { generateSessionToken, hashOpaqueToken } from '../lib/opaque-token.js';
import { hashPassword, verifyPassword } from '../lib/password.js';

export type AuthUser = { id: string; username: string; role: string };

export async function authenticateRequest(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<AuthUser | undefined> {
  const raw = request.cookies[SESSION_COOKIE_NAME];
  if (!raw) {
    reply.code(401).send({ error: 'UNAUTHORIZED', message: 'Not signed in' });
    return undefined;
  }
  const tokenHash = hashOpaqueToken(raw);
  const record = await prisma.session.findUnique({
    where: { tokenHash },
    include: { user: true },
  });
  if (!record || record.revoked || record.expiresAt < new Date()) {
    reply.code(401).send({ error: 'UNAUTHORIZED', message: 'Invalid or expired session' });
    return undefined;
  }
  return {
    id: record.user.id,
    username: record.user.username,
    role: record.user.role,
  };
}

export async function performLogin(
  env: Env,
  username: string,
  password: string
): Promise<
  | { ok: true; user: AuthUser; rawSession: string }
  | { ok: false; error: string; message: string }
> {
  const user = await prisma.user.findUnique({ where: { username } });
  if (!user) {
    return { ok: false, error: 'INVALID_CREDENTIALS', message: 'Invalid username or password' };
  }
  const passwordOk = await verifyPassword(password, user.passwordHash);
  if (!passwordOk) {
    return { ok: false, error: 'INVALID_CREDENTIALS', message: 'Invalid username or password' };
  }

  const rawSession = generateSessionToken();
  const tokenHash = hashOpaqueToken(rawSession);
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + env.SESSION_TTL_DAYS);

  await prisma.session.create({
    data: { userId: user.id, tokenHash, expiresAt },
  });

  return {
    ok: true,
    user: { id: user.id, username: user.username, role: user.role },
    rawSession,
  };
}

export function setSessionCookie(reply: FastifyReply, env: Env, rawSession: string): void {
  const maxAge = env.SESSION_TTL_DAYS * 24 * 60 * 60;
  reply.setCookie(SESSION_COOKIE_NAME, rawSession, {
    path: '/',
    httpOnly: true,
    secure: env.COOKIE_SECURE,
    sameSite: 'lax',
    maxAge,
  });
}

export function clearSessionCookie(reply: FastifyReply, env: Env): void {
  reply.clearCookie(SESSION_COOKIE_NAME, {
    path: '/',
    httpOnly: true,
    secure: env.COOKIE_SECURE,
    sameSite: 'lax',
  });
}

export async function logoutFromCookie(rawSession: string | undefined): Promise<void> {
  if (!rawSession) return;
  const tokenHash = hashOpaqueToken(rawSession);
  await prisma.session.updateMany({
    where: { tokenHash },
    data: { revoked: true },
  });
}

export async function updateUsername(
  userId: string,
  newUsername: string
): Promise<{ ok: true } | { ok: false; error: string; message: string }> {
  const exists = await prisma.user.findUnique({ where: { username: newUsername } });
  if (exists && exists.id !== userId) {
    return { ok: false, error: 'USERNAME_TAKEN', message: 'Username is already taken' };
  }
  await prisma.user.update({
    where: { id: userId },
    data: { username: newUsername },
  });
  return { ok: true };
}

export async function updatePassword(
  userId: string,
  currentPassword: string,
  newPassword: string,
  env: Env
): Promise<{ ok: true } | { ok: false; error: string; message: string }> {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) return { ok: false, error: 'NOT_FOUND', message: 'User not found' };
  const ok = await verifyPassword(currentPassword, user.passwordHash);
  if (!ok) {
    return { ok: false, error: 'INVALID_PASSWORD', message: 'Current password is incorrect' };
  }
  const passwordHash = await hashPassword(newPassword, env);
  await prisma.$transaction([
    prisma.user.update({ where: { id: userId }, data: { passwordHash } }),
    prisma.session.updateMany({ where: { userId }, data: { revoked: true } }),
  ]);
  return { ok: true };
}
