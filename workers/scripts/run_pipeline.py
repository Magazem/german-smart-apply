#!/usr/bin/env python3
"""Manual/production entrypoint wiring the three workers together:

    seed sources + company_aliases -> crawl every active source ->
    normalize new snapshots -> exact-dedup into canonical_jobs ->
    near-duplicate clustering across the resulting canonical_jobs

This script is NOT exercised by the pytest suite (which uses fixture payloads
and a FakeClient so it never touches the network or depends on this script).
It exists to show how the pieces are meant to be run for real, e.g. from a
cron job or a scheduler. Run it with:

    python scripts/run_pipeline.py

Requires DATABASE_URL to point at a real Postgres instance (see common/db.py
for the default used by local dev), and real network access for whichever
sources have non-empty board tokens / site slugs / feed URLs configured.
As shipped, every adapter except Stepstone has real, live-verified tokens
configured and will fetch actual jobs out of the box -- Stepstone's
feedUrls stays empty (see common/market_de.py's own comment for why: it's
a business/partnership blocker, not an engineering gap).
"""
from __future__ import annotations

import sys
from pathlib import Path

# Running this file directly (`python scripts/run_pipeline.py`) only puts
# scripts/ itself on sys.path, not workers/ - so `from common import db` etc.
# below fail unless something else adds workers/ first. pytest does that via
# pyproject.toml's pythonpath = ["."]; a container does it via the
# Dockerfile's PYTHONPATH; a bare `python scripts/run_pipeline.py` invocation
# (e.g. running this once against a real database from a local checkout) has
# neither, so do it here instead of relying on the caller's environment.
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import requests

from common import db
from crawler.runner import run_crawl
from crawler.seed import seed_sources
from deduplicator.dedup import run_dedup
from deduplicator.near_duplicates import run_near_duplicate_clustering
from deduplicator.seed import seed_company_aliases
from normalizer.pipeline import run_normalizer


def main() -> int:
    conn = db.connect()
    client = requests.Session()
    try:
        source_ids = seed_sources(conn)
        alias_count = seed_company_aliases(conn)
        conn.commit()
        print(f"Seeded {len(source_ids)} sources and {alias_count} company aliases.")

        cur = db.dict_cursor(conn)
        cur.execute('SELECT * FROM "sources" WHERE "isActive" = true')
        active_sources = cur.fetchall()

        # Per-source isolation. Without it, a single unusable payload from a
        # single tenant took down the whole invocation: the exception
        # propagated to the outer handler, so run_dedup() and
        # run_near_duplicate_clustering() below never ran and NO source got
        # its canonical_jobs refreshed that tick - then the next scheduled run
        # hit the same payload and failed the same way. The crawl work is
        # already committed per source, so rolling back here discards only the
        # failed source's uncommitted normalize work.
        failures: list[str] = []
        for source_row in active_sources:
            try:
                _crawl_and_normalize(conn, client, source_row)
            except Exception as exc:  # noqa: BLE001 - one bad source must not stop the rest
                failures.append(f"{source_row['sourceType']}: {exc}")
                print(f"[error] {source_row['sourceType']} failed, continuing: {exc!r}")
                # Recover the connection, don't just roll back. A bare
                # conn.rollback() here raises InterfaceError("connection already
                # closed") whenever the failure WAS the connection dying - which
                # is the actual production failure mode (a dropped Neon
                # connection mid-crawl) - so the rollback itself would escape
                # this handler and abort the run, defeating the isolation it
                # exists to provide. That is precisely how dedup got skipped and
                # left raw_jobs stranded at isDeduplicated = false.
                conn = _recover_connection(conn)

        # Each stage guarded separately: near-dup clustering is the memory- and
        # time-hungry one, and losing it should not also discard exact dedup's
        # committed work.
        for label, stage in (("dedup", run_dedup), ("near-dedup", run_near_duplicate_clustering)):
            try:
                result = stage(conn)
                conn.commit()
                print(f"[{label}] {result}")
            except Exception as exc:  # noqa: BLE001
                failures.append(f"{label}: {exc}")
                print(f"[error] {label} failed: {exc!r}")
                conn = _recover_connection(conn)

        if failures:
            # Every stage has had its chance by now, so the run's useful work is
            # committed - but exit non-zero so a partial failure is still visible
            # to the scheduler instead of being silently swallowed.
            print(f"[warn] {len(failures)} stage(s) failed: {'; '.join(failures)}")
            return 1
        return 0
    except Exception:  # noqa: BLE001
        # Best-effort: if we got here because the connection died, rollback()
        # raises too, and that would mask the original error with a much less
        # informative InterfaceError.
        try:
            conn.rollback()
        except Exception:  # noqa: BLE001
            pass
        raise
    finally:
        try:
            conn.close()
        except Exception:  # noqa: BLE001
            pass


def _recover_connection(conn):
    """Return a connection usable for the next stage.

    Rolls the current one back when it is still alive; opens a fresh one when it
    is not. Returning a working connection (rather than raising) is what lets a
    mid-run connection loss cost only the source that was in flight instead of
    the whole invocation - dedup still runs, and the crawl work already committed
    for earlier sources still gets folded into canonical_jobs.
    """
    if db.is_usable(conn):
        conn.rollback()
        return conn
    print("[warn] database connection was lost; reconnecting")
    try:
        conn.close()
    except Exception:  # noqa: BLE001 - already-dead connection, nothing to salvage
        pass
    return db.connect()


def _crawl_and_normalize(conn, client, source_row: dict) -> None:
    """Crawl one source and normalize exactly what this run fetched from it."""
    crawl_result = run_crawl(conn, client, source_row)
    conn.commit()
    print(f"[crawl] {source_row['sourceType']}: {crawl_result}")

    if crawl_result["status"] != "success":
        return

    # Scoped to exactly the snapshot row representing each job this run's own
    # crawl fetched (crawl_result["snapshotIds"]), not "every snapshot ever
    # recorded for this source" -- raw_job_snapshots is an append-only history
    # log that keeps a row per distinct payload forever (see runner.run_crawl),
    # so re-fetching and re-normalizing the whole history on every 4-hourly
    # invocation grows unbounded with total crawl count and was the main driver
    # of the worker machine's OOM. Re-normalizing the same job repeatedly is
    # otherwise harmless (upsert keyed on sourceId+originalJobId), but doing it
    # for the entire history every run is pure waste.
    #
    # Note these ids are no longer all freshly-inserted rows: when a payload
    # comes back unchanged the crawler skips the write and returns the existing
    # row's id, so this list still covers every job fetched this run and the
    # normalizer's behavior is unchanged.
    if not crawl_result["snapshotIds"]:
        return

    snap_cur = db.dict_cursor(conn)
    snap_cur.execute(
        'SELECT * FROM "raw_job_snapshots" WHERE "id" = ANY(%s)', (crawl_result["snapshotIds"],)
    )
    snapshots = snap_cur.fetchall()
    normalize_result = run_normalizer(conn, source_row, snapshots)
    conn.commit()
    print(f"[normalize] {source_row['sourceType']}: {normalize_result}")


if __name__ == "__main__":
    sys.exit(main())
