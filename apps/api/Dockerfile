# Build context is the repo root (see infra/docker-compose.yml's
# `context: ..`) because this is a pnpm workspace - the api package alone
# can't resolve its workspace:* dependencies (shared/db/market-de/ai).
FROM node:22-alpine AS base
RUN corepack enable
WORKDIR /app

FROM base AS deps
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml turbo.json ./
COPY apps/api/package.json apps/api/package.json
COPY packages/shared/package.json packages/shared/package.json
COPY packages/db/package.json packages/db/package.json
COPY packages/market-de/package.json packages/market-de/package.json
COPY packages/ai/package.json packages/ai/package.json
RUN pnpm install --frozen-lockfile

FROM deps AS build
COPY tsconfig.base.json ./
COPY packages/shared packages/shared
COPY packages/db packages/db
COPY packages/market-de packages/market-de
COPY packages/ai packages/ai
COPY apps/api apps/api
RUN pnpm --filter @german-smart-apply/shared build \
 && DATABASE_URL="postgresql://placeholder/placeholder" pnpm --filter @german-smart-apply/db build \
 && pnpm --filter @german-smart-apply/market-de build \
 && pnpm --filter @german-smart-apply/ai build \
 && pnpm --filter @german-smart-apply/api build

FROM base AS runtime
# NODE_ENV is intentionally not baked in here - it's environment-specific
# (fly.toml/deployment secrets set NODE_ENV=production; local docker-compose
# leaves it unset so the mock AI/billing providers stay available). Baking
# NODE_ENV=production into the image would crash-loop any non-production use
# of this image, since auth.module.ts/billing.service.ts refuse to start
# under NODE_ENV=production without real JWT_SECRET/Stripe secrets configured.
COPY --from=build /app /app
WORKDIR /app/apps/api
EXPOSE 3001
CMD ["node", "dist/main.js"]
