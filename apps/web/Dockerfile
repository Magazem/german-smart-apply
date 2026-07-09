# Build context is the repo root (pnpm workspace - web depends on
# @german-smart-apply/shared and @german-smart-apply/ai's mock-only entry).
FROM node:22-alpine AS base
RUN corepack enable
WORKDIR /app

FROM base AS deps
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml turbo.json ./
COPY apps/web/package.json apps/web/package.json
COPY packages/shared/package.json packages/shared/package.json
COPY packages/db/package.json packages/db/package.json
COPY packages/market-de/package.json packages/market-de/package.json
COPY packages/ai/package.json packages/ai/package.json
RUN pnpm install --frozen-lockfile

FROM deps AS build
COPY tsconfig.base.json ./
COPY packages/shared packages/shared
COPY packages/market-de packages/market-de
COPY packages/ai packages/ai
COPY apps/web apps/web
RUN pnpm --filter @german-smart-apply/shared build \
 && pnpm --filter @german-smart-apply/market-de build \
 && pnpm --filter @german-smart-apply/ai build \
 && pnpm --filter @german-smart-apply/web build

FROM base AS runtime
ENV NODE_ENV=production
COPY --from=build /app /app
WORKDIR /app/apps/web
EXPOSE 3100
CMD ["node_modules/.bin/next", "start", "-p", "3100"]
