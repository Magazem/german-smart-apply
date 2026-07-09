# One-shot image: applies Prisma migrations against the compose Postgres
# service before api/worker start. Build context is the repo root (see
# infra/docker-compose.yml).
FROM node:22-alpine
RUN corepack enable
WORKDIR /app

COPY package.json pnpm-workspace.yaml pnpm-lock.yaml turbo.json ./
COPY packages/db/package.json packages/db/package.json
RUN pnpm install --frozen-lockfile

COPY packages/db packages/db
WORKDIR /app/packages/db
CMD ["npx", "prisma", "migrate", "deploy"]
