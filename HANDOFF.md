# Handoff — core matching path, 2026-07-31

State of the crawl → normalize → dedup → rank path after fixing the three
defects that made the product unusable end to end. Written for whoever picks
this up next, including a future session with no memory of this one.

Every number here was measured against the production database, not estimated.
Where something is unverified, it says so.

---

## TL;DR

Three separate bugs, all merged and fixed (PRs #60, #61). They had one thing in
common, and it is the most useful lesson in this document: **each was a real
failure that an error handler caught, logged, and reported as success.** The
pipeline said "success" for eight days while serving stale results.

| # | Defect | Effect | Status |
|---|---|---|---|
| 1 | `search()` scored only the 200 newest matches | 98.4% of jobs could never be ranked | Fixed (#60) |
| 2 | SmartRecruiters crawl outlived its DB connection | 59.5% of corpus had no description; source stale 8 days | Fixed (#60) |
| 3 | `run_dedup` `UniqueViolation` on any edited posting | `canonical_jobs` frozen since 2026-07-23 | Fixed (#61) |

Plus four normalizer defects on hard-filter fields (#60), and one regression of
my own reverted in #61.

---

## The one thing still outstanding

**Nothing in code.** The fixes are merged; the working tree is clean.

What remains is *verification*, which needs a pipeline run after the #61 merge
(10:51Z). As of writing, that run had not happened yet:

```
canonical_jobs last refreshed:  2026-07-23   ← still frozen at time of writing
jobs awaiting dedup:            12,301
smartrecruiters descriptions:   8,382 of 9,617 raw_jobs   ← already fixed
```

The pipeline runs on a 4-hourly cron (`.github/workflows/crawl-pipeline.yml`),
or can be triggered with `gh workflow run crawl-pipeline.yml --ref main`.

### What to check on that run

1. **`canonical_jobs` actually refreshes.** This is the proof #3 is fixed end to
   end. `select max("updatedAt") from canonical_jobs` should no longer say
   2026-07-23, and `select count(*) from raw_jobs where "isDeduplicated" = false`
   should fall from ~12,300 toward 0.
2. **`[near-dedup]` completes.** It has not run since 2026-07-23 (it was dying on
   the same dropped connection as #2), so this is its first genuine execution —
   with a backlog, and at 512mb. `workers/fly.toml` documents a prior OOM at that
   size. The footprint was measured at **52.5MB today, ~82MB** with SmartRecruiters
   descriptions included, so it should fit, but that is a projection and this run
   is the first real test. Watch for a run that logs `[dedup]` but never
   `[near-dedup]`.
3. **The reclassifications land.** `raw_jobs` already holds 1,823 hybrid / 1,552
   remote. `canonical_jobs` still reported 34 / 329 while frozen.

---

## What was wrong, and why it was invisible

### 1. Ranking scored a recency slice, not the corpus

`JobsService.search()` fetched the 200 most recently posted matches and scored
only those. With 12,902 visible jobs, **12,702 (98.4%) could never be scored**,
and the 200-row cut reached back about 21 hours.

The symptom was confusing on purpose: narrowing a search by hand shrank the
matching set below 200, so the good job entered the pool and appeared. It looked
like a ranking problem. It was a retrieval problem.

`search()` now scores the whole filtered set, using a narrow `select` (the old
`include` also pulled `jobDescriptionHtml` — 19.3MB corpus-wide, never scored
against) and hydrating full records for one page at the end. `take` survives only
as an anti-OOM ceiling far above the corpus, logged loudly when hit.

### 2. SmartRecruiters crawl outlived its database connection

7,675 visible jobs with empty descriptions, and 0 of 8,391 stored payloads
contained the `jobAd` key that carries one — while the endpoint itself returned
`jobAd.sections` perfectly when called directly.

The source had not crawled since 2026-07-23, the day the per-posting detail fetch
shipped. Serialized detail calls put the fetch at 15–60 minutes; the pipeline
holds one Postgres connection across a whole crawl, so Neon reaped it and every
write after the fetch died. `run_pipeline.py`'s per-source handler caught that and
continued, so the run still reported success.

Fixed by running detail calls on a small thread pool. **Verified in production:
6m18s, 8,377 payloads written, 8,374 descriptions landed.**

### 3. Dedup died on every edited posting

`run_dedup` inserted a `duplicate_cluster_members` row per job with no
`ON CONFLICT`, assuming the batch was only newly-arrived jobs. It wasn't:
`run_dedup` selects on `isDeduplicated = false`, and `normalizer/pipeline.py`
deliberately resets that flag when a posting's content changes — that reset is
what makes an edit propagate. So edited jobs returned already holding a membership
row and violated the unique index.

`run_dedup` is a single transaction, so **one collision rolled back every cluster**.
Measured before the fix: **9,049 of 12,160 pending jobs already had a membership
row**, so the stage could not have succeeded on any run.

This is why #1 and #2's improvements were invisible on the site: they landed in
`raw_jobs`, and `canonical_jobs` — what the API serves — had stopped being
rebuilt.

---

## Follow-ups, roughly in priority order

### Worth doing soon

**Batch the normalizer's inserts.** `run_normalizer` writes one row at a time and
commits once at the end — 8,377 sequential Frankfurt→Neon round-trips inside a
single transaction, measured at **37 minutes** for SmartRecruiters. It works, but
it is the same fragility removed from the crawler in #2: a long transaction a
managed Postgres can reap, and if it drops, all of it rolls back.

**Make swallowed failures loud.** All three bugs hid behind a handler that caught,
logged and continued while the run reported success. `run_pipeline.py` already
exits non-zero on partial failure; the gap is that nothing alerts on it. A source
that writes zero snapshots for 8 days should page someone.

### Deliberately deferred

- **Saved-search alerts** (`findNewMatches`) still send newest-20, unranked. 20 is
  an email-size cap, not a scoring pool, but it is a matching surface that does not
  rank.
- **Real search indexing** (Postgres FTS/pgvector) is still Phase 3 per `plan.md`.
  Scoring the full corpus per request is correct but linear — fine at 12.9k, not at
  100k.

### Known limits, documented in code

- `"San Francisco, CA"` with no country still resolves to Canada. Bare two-letter
  codes collide with US state abbreviations, and an unambiguous segment now wins
  (`"San Francisco, CA, USA"` → US) — but with nothing else to go on, a gazetteer is
  the only real fix. The ambiguous codes are deliberately **not** deleted: without
  them `"Amsterdam, NL"` falls back to the DE default and *passes* the DE hard
  filter, which is worse.
- German compound titles (`Teamleiterin`) still yield no seniority. Part of the
  deferred v2 German-title work in `V2-BACKLOG.md`.
- `"home office in London"` still reads as remote.

### Pre-existing, untouched

- Two `application-pdf` tests fail on `main` (`pdf-parse`, "bad XRef entry"),
  unrelated to any of this — confirmed failing before these changes.
- **Stepstone** is an active source with zero companies configured, so it crawls
  successfully and returns nothing. `run_pipeline.py`'s docstring says it is the one
  adapter without live-verified tokens, so this looks intentional.

---

## Testing notes for whoever is next

**The DB-backed suites do not run without Postgres — and they *error*, they do not
fail.** That distinction cost a regression in #60: a `conn.commit()` added to
`run_crawl` broke the transaction-boundary contract in `tests/conftest.py` (each
test *is* a transaction, rolled back at teardown), breaking 5 tests that were being
skipped rather than passing. Reverted in #61.

To actually run them, point `DATABASE_URL` at a throwaway Neon branch:

```bash
neonctl branches create --project-id <id> --name scratch
# TRUNCATE the data tables first — a branch is a copy of production,
# and run_dedup will otherwise try to process the entire backlog
DATABASE_URL="<branch-url>" pytest tests -q
neonctl branches delete scratch --project-id <id>
```

Full worker suite on real Postgres: **247 passed, 0 failed.**

**Validate inference changes against the corpus, not just unit tests.** Running the
new `infer_remote_type` across all 5,077 live descriptions caught two regressions
that unit tests passed clean: word boundaries silently rejected `remotely` /
`remotework` / `Hybridmodus`, and `Kein Problem, unsere Homeoffice-Option…` was read
as a negation when it is an offer. Every reclassification was then read by hand
before shipping.
