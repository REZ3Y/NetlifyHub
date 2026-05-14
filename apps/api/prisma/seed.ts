import 'dotenv/config';
import bcrypt from 'bcryptjs';
import { PrismaClient, Role } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const username = process.env.SEED_ADMIN_USERNAME?.trim();
  const password = process.env.SEED_ADMIN_PASSWORD;
  if (!username || !password) {
    console.log('[seed] Skipped (set SEED_ADMIN_USERNAME and SEED_ADMIN_PASSWORD to bootstrap).');
    return;
  }
  const existing = await prisma.user.count();
  if (existing > 0) {
    console.log('[seed] Skipped (users already exist).');
    return;
  }
  const rounds = Number(process.env.BCRYPT_ROUNDS || 12);
  const passwordHash = await bcrypt.hash(password, rounds);
  await prisma.user.create({
    data: { username, passwordHash, role: Role.ADMIN },
  });
  console.log(`[seed] Admin "${username}" created.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
