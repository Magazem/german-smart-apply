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
  # OPENROUTER_API_KEY="sk-or-..."  # optional — if set, takes priority over ANTHROPIC_API_KEY (see below)
fly deploy --config apps/api/fly.toml .
```

### Testing real AI output cheaply before committing to Anthropic

`createAiProvider()` (packages/ai/src/index.ts) checks `OPENROUTER_API_KEY` before
`ANTHROPIC_API_KEY`. Setting only `OPENROUTER_API_KEY` routes every AI call
(CV parsing, cover letters, follow-up emails, interview prep, etc.) through
[OpenRouter](https://openrouter.ai) instead — an OpenAI-compatible proxy in
front of 400+ models, several of which are free. This is meant for validating
that real-model output actually flows through the app end to end (not
`MockAiProvider`'s deterministic templates) before paying for Anthropic:

```sh
fly secrets set --app german-smart-apply-api OPENROUTER_API_KEY="sk-or-..."
```

Defaults to `openai/gpt-oss-120b:free` (supports native tool-calling/structured
output, unlike many free models on OpenRouter's rotating roster). Override with
`OPENROUTER_MODEL` if that slug stops being available — check
[openrouter.ai/models](https://openrouter.ai/models) filtered to `:free`.
Free-tier rate limits are low (as of writing, ~50 requests/day per key without
added credit) — fine for a smoke test, not for real traffic. Once satisfied
with behavior, remove `OPENROUTER_API_KEY` and set `ANTHROPIC_API_KEY` instead
to switch to the paid, production-grade model.

`JWT_SECRET` and all three `STRIPE_*` vars above are required with `NODE_ENV=production`
(Fly sets `NODE_ENV=production` by default) — the app fails to start rather
than silently falling back to a hardcoded JWT secret or an unsigned mock
billing-webhook handler, both of which would otherwise let an attacker forge
auth tokens or flip any user's subscription tier. `ANTHROPIC_API_KEY` is the
only one that's genuinely optional; omitting it runs with the deterministic
`MockAiProvider` (no security implication either way, just fake AI output).

Migrations run automatically as part of every deploy — `apps/api/fly.toml`
sets `[deploy] release_command` to `pnpm --filter @german-smart-apply/db
migrate:deploy`, which Fly runs in a one-off machine against `DATABASE_URL`
before the new version takes traffic. A failed migration aborts the deploy
and leaves the previous version running, so there's no manual step here —
just make sure `DATABASE_URL` is set via `fly secrets` (below) before the
first deploy.

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
3. Generate a deploy token for each app - a token from `fly tokens create deploy
   --app <name>` is scoped to that one app only, so api and web each need their
   own:
   ```
   fly tokens create deploy -x 999999h --app german-smart-apply-api
   fly tokens create deploy -x 999999h --app german-smart-apply-web
   ```
4. Add each as its own GitHub Actions secret (repo Settings -> Secrets and
   variables -> Actions -> New repository secret) - **do not save both under
   the same secret name**, or whichever you save second silently overwrites
   the first and the other app's deploy job stops authorizing:
   - `FLY_API_TOKEN_API` - the api-scoped token
   - `FLY_API_TOKEN_WEB` - the web-scoped token

   (Alternative: `fly tokens create org -x 999999h` makes one token that can
   deploy any app in your org - simpler, but broader access than the
   per-app tokens above. If you use this, both jobs can share a single
   `FLY_API_TOKEN` secret instead.)

After that, every push to `main` runs `flyctl deploy` for both apps using the
`fly.toml`/Dockerfile config already in the repo - including the `NEXT_PUBLIC_*`
`[build.args]` fix, so the web app builds against the real API by default.

## Workers (crawler/normalizer/deduplicator)

`workers/scripts/run_pipeline.py` (containerized via `workers/Dockerfile`,
configured via `workers/fly.toml`) runs the full seed -> crawl -> normalize ->
dedup pipeline once per invocation and exits — it's a batch job, not a
standing server, so `workers/fly.toml` has no `[http_service]` the way
`apps/api`/`apps/web` do.

`.github/workflows/crawl-pipeline.yml` triggers it every 4 hours via a GitHub
Actions cron schedule (plus manual "Run workflow" dispatch) by running
`flyctl deploy --config workers/fly.toml .` — for an app with no
`[http_service]`, this builds the image and (re)starts the one configured
machine, which runs the pipeline to completion and exits. Every 4 hours
matches the finest `crawlFrequencyMinutes` among configured sources (see
`workers/common/market_de.py`); coarser sources just get crawled a bit more
often than their nominal cadence, which is harmless since every step
(crawl/normalize/dedup) is idempotent.

One-time setup before the first scheduled run:

1. Create the Fly app (registers the name, doesn't deploy anything yet):
   ```
   fly launch --config workers/fly.toml --no-deploy
   ```
2. Set the `DATABASE_URL` secret — same production Postgres the API uses,
   since the pipeline writes into the same `sources`/`raw_jobs`/
   `canonical_jobs` tables `apps/api` reads from:
   ```
   fly secrets set --app german-smart-apply-workers DATABASE_URL="postgresql://..."
   ```
3. Generate an app-scoped deploy token and add it as a GitHub Actions secret
   (repo Settings -> Secrets and variables -> Actions -> New repository
   secret), same narrowest-scope reasoning as the api/web tokens above:
   ```
   fly tokens create deploy -x 999999h --app german-smart-apply-workers
   ```
   Save it as `FLY_API_TOKEN_WORKERS`.
4. Do one manual run to confirm it actually works end to end before trusting
   the schedule — either trigger the workflow manually (Actions tab ->
   "Run crawl pipeline" -> Run workflow), or run
   `flyctl deploy --config workers/fly.toml .` locally once. Then check
   `fly logs --app german-smart-apply-workers` and the `source_crawl_runs`
   table for a real, successful run before walking away from it.

Since this is the first time this exact deploy-a-batch-job-via-`fly deploy`
pattern has been run for real (unlike the api/web services, which have
deployed successfully before), watch the first couple of scheduled runs for
correctness — in particular whether a machine that already exited cleanly
gets replaced/restarted correctly by the next scheduled `flyctl deploy`, or
whether `workers/fly.toml` needs an explicit restart/auto-destroy policy
added. Adjust `workers/fly.toml` if not.

## Stripe webhook

Once the API is deployed, register the webhook endpoint in the Stripe
dashboard (or via `stripe listen --forward-to` for local testing) pointing at
`https://<api-domain>/billing/webhook`, and set `STRIPE_WEBHOOK_SECRET` to the
signing secret Stripe gives you for that endpoint.

## Promoting an admin user

There is no self-serve path to the `/admin` source-health panel — same
reasoning as there being no self-serve path to Pro without going through
Stripe. Promote a user by setting their `role` column directly:

```sql
UPDATE users SET role = 'admin' WHERE email = 'you@example.com';
```

Takes effect on that user's next request (role isn't cached in the JWT -
`AdminGuard` looks it up fresh every time, same pattern as `ProTierGuard`).
