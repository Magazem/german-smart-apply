# Deployment

Per plan.md's stack table (Railway, Fly.io, or VPS), this repo ships Fly.io
config as the concrete example. No live deployment has been run from this
environment — that requires a real Fly.io account and secrets this sandbox
doesn't have, and pushing to a shared production target is not something to
do without your explicit go-ahead. Everything below is prepared and ready to
run once you have an account.

## Prerequisites

- A Postgres instance reachable from the deployed apps (`fly postgres create`,
  or any managed provider — Neon, Supabase, RDS).
- `flyctl` installed and authenticated (`fly auth login`).

## Deploy the API

```sh
fly launch --config apps/api/fly.toml --dockerfile apps/api/Dockerfile --no-deploy   # first time only, creates the app
fly secrets set --app german-smart-apply-api \
  DATABASE_URL="postgresql://..." \
  JWT_SECRET="$(openssl rand -hex 32)" \
  WEB_APP_URL="https://german-smart-apply-web.fly.dev" \
  STRIPE_SECRET_KEY="sk_live_..." STRIPE_WEBHOOK_SECRET="whsec_..." STRIPE_PRO_PRICE_ID="price_..."
  # ANTHROPIC_API_KEY="sk-ant-..."  # optional — omit to run with the deterministic MockAiProvider
fly deploy --config apps/api/fly.toml --dockerfile apps/api/Dockerfile .
```

`JWT_SECRET` and all three `STRIPE_*` vars above are required with `NODE_ENV=production`
(Fly sets `NODE_ENV=production` by default) — the app fails to start rather
than silently falling back to a hardcoded JWT secret or an unsigned mock
billing-webhook handler, both of which would otherwise let an attacker forge
auth tokens or flip any user's subscription tier. `ANTHROPIC_API_KEY` is the
only one that's genuinely optional; omitting it runs with the deterministic
`MockAiProvider` (no security implication either way, just fake AI output).

Run migrations once against the target database before first deploy (or as
a release step): `DATABASE_URL=... pnpm --filter @german-smart-apply/db migrate:deploy`.

## Deploy the frontend

```sh
fly launch --config apps/web/fly.toml --dockerfile apps/web/Dockerfile --no-deploy   # first time only
fly secrets set --app german-smart-apply-web \
  NEXT_PUBLIC_API_URL="https://german-smart-apply-api.fly.dev"
fly deploy --config apps/web/fly.toml --dockerfile apps/web/Dockerfile .
```

## Workers (crawler/normalizer/deduplicator)

Phase 1 scope is a one-shot pipeline run (`workers/scripts/run_pipeline.py`,
containerized via `workers/Dockerfile`), not a standing scheduler. Trigger it
per source's `crawlFrequencyMinutes` via Fly's scheduled machines, a Fly
Machine run on a cron trigger from an external scheduler, or a Kubernetes
CronJob if deploying elsewhere — building an in-repo scheduler is Phase 2+
work per plan.md's Source Ingestion Layer.

## Stripe webhook

Once the API is deployed, register the webhook endpoint in the Stripe
dashboard (or via `stripe listen --forward-to` for local testing) pointing at
`https://<api-domain>/billing/webhook`, and set `STRIPE_WEBHOOK_SECRET` to the
signing secret Stripe gives you for that endpoint.
