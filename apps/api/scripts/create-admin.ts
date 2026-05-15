import './ensure-root-env.js';
import * as readline from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import { Role } from '@prisma/client';
import { loadEnv } from '../src/config/env.js';
import { prisma } from '../src/db/prisma.js';
import { hashPassword } from '../src/lib/password.js';

function isMissingTablesError(e: unknown): boolean {
  return (
    typeof e === 'object' && e !== null && 'code' in e && (e as { code: string }).code === 'P2021'
  );
}

async function main() {
  const env = loadEnv();
  const rl = readline.createInterface({ input, output });

  const username = (await rl.question('Admin username: ')).trim();
  const password = (await rl.question('Admin password (min 8 chars): ')).trim();
  await rl.close();

  if (!username || username.length < 2) {
    console.error('Username must be at least 2 characters.');
    process.exit(1);
  }
  if (!password || password.length < 8) {
    console.error('Password must be at least 8 characters.');
    process.exit(1);
  }

  const existing = await prisma.user.findFirst();
  if (existing) {
    console.error('A user already exists. Refusing to create another admin via this script.');
    process.exit(1);
  }

  const passwordHash = await hashPassword(password, env);
  await prisma.user.create({
    data: {
      username,
      passwordHash,
      role: Role.ADMIN,
    },
  });

  console.log(`Admin user "${username}" created successfully.`);
  await prisma.$disconnect();
}

main().catch((e) => {
  if (isMissingTablesError(e)) {
    console.error(
      [
        'Database schema is missing (tables not created yet).',
        '',
        'From the repository root run:',
        '  pnpm db:migrate',
        '',
        'Then run create-admin again.',
      ].join('\n')
    );
    process.exit(1);
  }
  console.error(e);
  process.exit(1);
});
