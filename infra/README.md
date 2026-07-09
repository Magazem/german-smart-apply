# Local dev with Docker Compose

```sh
cp env.example .env   # optional - defaults work with no real Stripe/Anthropic keys
docker compose up --build
```

Services: `postgres` (5432), `redis` (6379), `db-migrate` (one-shot, applies
Prisma migrations then exits), `api` (3001), `web` (3100), `worker` (one-shot
crawl→normalize→dedup pipeline run - see `workers/scripts/run_pipeline.py`;
re-run on demand with `docker compose run --rm worker`).

Leaving `STRIPE_*` and `ANTHROPIC_API_KEY` unset (the default) runs the API
against `MockBillingProvider`/`MockAiProvider` - no external accounts needed
to bring the whole stack up locally.

## Verification status

`docker compose config` validates cleanly (service graph, env interpolation,
volumes, dependency ordering with health checks). `docker build` was
attempted and confirmed to parse and start correctly, but this sandbox's
network policy blocks pulling images from Docker Hub (`node:22-alpine`,
`postgres:16-alpine`, etc. all return 403 from the registry CDN - the same
restriction that required installing Postgres/Redis natively for this
session's own local dev instead of via these compose services). A `docker
compose up --build` has **not** been run end-to-end here; do that once in an
environment with normal registry access before relying on this for
deployment.
