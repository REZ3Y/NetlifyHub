FROM node:22-bookworm-slim AS base
RUN apt-get update && apt-get install -y openssl ca-certificates && rm -rf /var/lib/apt/lists/*
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@9.14.2 --activate

FROM base AS build
COPY package.json pnpm-workspace.yaml ./
COPY pnpm-lock.yaml* ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY apps/worker/package.json apps/worker/
COPY packages/shared/package.json packages/shared/
RUN pnpm install
COPY . .
RUN pnpm --filter @netlifyhub/shared build
RUN pnpm --filter @netlifyhub/api exec prisma generate
RUN pnpm --filter @netlifyhub/api build

FROM base AS runner
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build /app /app
RUN chmod +x docker/api-entrypoint.sh
EXPOSE 3000
ENTRYPOINT ["/app/docker/api-entrypoint.sh"]
