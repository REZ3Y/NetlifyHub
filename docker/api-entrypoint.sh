#!/bin/sh
set -e
cd /app
pnpm --filter @netlifyhub/api exec prisma migrate deploy
pnpm --filter @netlifyhub/api exec prisma db seed
exec node apps/api/dist/server.js
