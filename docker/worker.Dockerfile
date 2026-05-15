FROM node:22-bookworm-slim AS base
RUN apt-get update && apt-get install -y openssl ca-certificates && rm -rf /var/lib/apt/lists/*
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@9.14.2 --activate

FROM base AS build
COPY package.json pnpm-workspace.yaml ./
COPY pnpm-lock.yaml* ./
COPY apps/worker/package.json apps/worker/
COPY packages/shared/package.json packages/shared/
COPY packages/netlify-client/package.json packages/netlify-client/
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
RUN pnpm install --ignore-scripts
COPY . .
RUN pnpm --filter @netlifyhub/shared build \
 && test -f packages/shared/dist/index.d.ts
RUN pnpm --filter @netlifyhub/netlify-client build
RUN pnpm --filter @netlifyhub/api exec prisma generate
RUN pnpm --filter @netlifyhub/api build
RUN pnpm --filter @netlifyhub/worker build

FROM base AS runner
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build /app /app
CMD ["node", "apps/worker/dist/index.js"]
