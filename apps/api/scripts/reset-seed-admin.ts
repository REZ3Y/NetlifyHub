/**
 * Bootstrap or reset the admin password from SEED_ADMIN_* in repo-root `.env`.
 * Use after Docker install if login fails: docker compose exec api pnpm reset-admin-from-env
 */
import { loadRootEnv } from '@netlifyhub/shared';
import bcrypt from 'bcryptjs';
import { PrismaClient, Role } from '@prisma/client';

loadRootEnv();

const prisma = new PrismaClient();

async function main() {
  const username = process.env.SEED_ADMIN_USERNAME?.trim();
  const password = process.env.SEED_ADMIN_PASSWORD;
  if (!username || password === undefined || password === '') {
    console.error('Set SEED_ADMIN_USERNAME and SEED_ADMIN_PASSWORD in .env first.');
    process.exit(1);
  }

  const rounds = Number(process.env.BCRYPT_ROUNDS || 12);
  const passwordHash = await bcrypt.hash(password, rounds);
  const count = await prisma.user.count();

  if (count === 0) {
    await prisma.user.create({
      data: { username, passwordHash, role: Role.ADMIN },
    });
    console.log(`[reset-seed-admin] Admin "${username}" created.`);
    return;
  }

  const user = await prisma.user.findUnique({ where: { username } });
  if (!user) {
    console.error(
      `[reset-seed-admin] User "${username}" not found (${count} user(s) in database).`
    );
    process.exit(1);
  }

  await prisma.$transaction([
    prisma.user.update({ where: { id: user.id }, data: { passwordHash } }),
    prisma.session.updateMany({ where: { userId: user.id }, data: { revoked: true } }),
  ]);
  console.log(`[reset-seed-admin] Password updated for "${username}".`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
