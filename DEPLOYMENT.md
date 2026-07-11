# Deployment

Per plan.md's stack table (Railway, Fly.io, or VPS), this repo ships Fly.io
config as the concrete example. No live deployment has been run from this
environment — that requires a real Fly.io account and secrets this sandbox
doesn't have, and pushing to a shared production target is not something to
do without your explicit go-ahead. Everything below is prepared and ready to
run once you have an account.

Two paths to deploy: manually via `flyctl` (below), or continuously via the
`.github/workflows/fly-deploy.yml` GitHub Actions workflow that deploys both
apps on every push to `main` — see "Continuous deployment" further down.
Either way, the one-time app-creation step (`fly launch --no-deploy`) and
setting real secrets is a manual step you do once per app.

## Prerequisites

- A Postgres instance reachable from the deployed apps (`fly postgres create`,
  or any managed provider — Neon, Supabase, RDS).
- `flyctl` installed and authenticated (`fly auth login`).

## Deploy the API

Run these from the repo root — not from inside `apps/api`. Each `fly.toml`'s
`[build] dockerfile` value is relative to that `fly.toml`'s own directory
(so just `Dockerfile`, not `apps/api/Dockerfile` - found by hitting the
doubled path `apps/api/apps/api/Dockerfile not found` in a real deploy).
The build *context* is a separate setting and still needs to be the repo
root, which the trailing `.` on `fly deploy` provides - required so the
Dockerfile's `COPY packages/shared` etc. can reach the rest of the pnpm
workspace. Don't add a redundant `--dockerfile` flag on top of either of
these; it doesn't help and isn't needed.

```sh
fly launch --config apps/api/fly.toml --no-deploy   # first time only, creates the app
fly secrets set --app german-smart-apply-api \
  DATABASE_URL="postgresql://..." \
  JWT_SECRET="$(openssl rand -hex 32)" \
  WEB_APP_URL="https://german-smart-apply-web.fly.dev" \
  STRIPE_SECRET_KEY="sk_live_..." STRIPE_WEBHOOK_SECRET="whsec_..." STRIPE_PRO_PRICE_ID="price_..."
  # ANTHROPIC_API_KEY="sk-ant-..."  # optional — omit to run with the deterministic MockAiProvider
fly deploy --config apps/api/fly.toml .
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

Same rule as above — `dockerfile` in `apps/web/fly.toml` is relative to
`apps/web/`, and the trailing `.` on `fly deploy` keeps the build context
at the repo root.

```sh
fly launch --config apps/web/fly.toml --no-deploy   # first time only
fly deploy --config apps/web/fly.toml .
```

`NEXT_PUBLIC_API_URL` and `NEXT_PUBLIC_USE_MOCK_API` come from `apps/web/fly.toml`'s
`[build.args]`, not `fly secrets`/`[env]` — Next.js inlines `NEXT_PUBLIC_*` vars into
the client bundle when `next build` runs, which happens during `fly deploy`'s image
build, before any runtime secret or `[env]` value exists. Setting them only at
runtime (as an earlier version of this doc suggested) silently ships a frontend
that's still wired to the mock data layer no matter what you set at runtime -
edit the `[build.args]` values in `fly.toml` (or pass `--build-arg` to `fly deploy`)
if the API's URL differs from the default.

## Continuous deployment (GitHub Actions)

`.github/workflows/fly-deploy.yml` deploys both apps on every push to `main`
(and via manual "Run workflow" dispatch). One-time setup before the first
push after enabling this:

1. Create both Fly apps once, same as the manual path above:
   `fly launch --config apps/api/fly.toml --no-deploy`
   and the equivalent for `apps/web`. This just registers the app names on
   Fly — it doesn't deploy anything yet.
2. Set the runtime secrets on each app with `fly secrets set` exactly as in
   "Deploy the API" above (`DATABASE_URL`, `JWT_SECRET`, the three `STRIPE_*`
   vars, optionally `ANTHROPIC_API_KEY`). GitHub Actions never sees these -
   they live on Fly, set once via the CLI.
3. Generate a deploy token: `fly tokens create deploy -x 999999h --app german-smart-apply-api`
   (repeat for `-web`, or use one token scoped to your org if you prefer).
4. Add it as a GitHub Actions secret named `FLY_API_TOKEN`: repo Settings ->
   Secrets and variables -> Actions -> New repository secret.

After that, every push to `main` runs `flyctl deploy` for both apps using the
`fly.toml`/Dockerfile config already in the repo - including the `NEXT_PUBLIC_*`
`[build.args]` fix, so the web app builds against the real API by default.

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
