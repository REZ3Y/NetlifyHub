FROM node:22-bookworm-slim AS base
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@9.14.2 --activate

FROM base AS build
ARG VITE_APP_TITLE=NetlifyHub
# Browser must reach the API (no reverse proxy). Default matches compose port publish.
ARG VITE_API_BASE=http://localhost:3000
ENV VITE_APP_TITLE=${VITE_APP_TITLE}
ENV VITE_API_BASE=${VITE_API_BASE}
COPY package.json pnpm-workspace.yaml ./
COPY pnpm-lock.yaml* ./
COPY apps/web/package.json apps/web/
COPY apps/api/package.json apps/api/
COPY apps/worker/package.json apps/worker/
COPY packages/shared/package.json packages/shared/
RUN pnpm install
COPY . .
RUN pnpm --filter @netlifyhub/web build

FROM node:22-bookworm-slim AS runner
WORKDIR /app
RUN npm install -g serve@14.2.4
COPY --from=build /app/apps/web/dist ./dist
RUN chown -R node:node /app/dist
USER node
EXPOSE 8080
CMD ["serve", "-s", "dist", "-l", "tcp://0.0.0.0:8080"]
