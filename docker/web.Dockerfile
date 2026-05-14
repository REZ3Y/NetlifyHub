FROM node:22-bookworm-slim AS base
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@9.14.2 --activate

FROM base AS build
ARG VITE_APP_TITLE=NetlifyHub
ENV VITE_APP_TITLE=${VITE_APP_TITLE}
COPY package.json pnpm-workspace.yaml ./
COPY pnpm-lock.yaml* ./
COPY apps/web/package.json apps/web/
COPY apps/api/package.json apps/api/
COPY apps/worker/package.json apps/worker/
COPY packages/shared/package.json packages/shared/
RUN pnpm install
COPY . .
RUN pnpm --filter @netlifyhub/web build

FROM nginx:1.27-alpine AS runner
COPY docker/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/apps/web/dist /usr/share/nginx/html
EXPOSE 80
