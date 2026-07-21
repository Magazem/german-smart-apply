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
As shipped, market-de's Greenhouse/Lever board tokens and Stepstone feed URLs
are empty lists (see common/market_de.py) -- only the Arbeitsagentur adapter
will fetch anything out of the box.
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

        for source_row in active_sources:
            crawl_result = run_crawl(conn, client, source_row)
            conn.commit()
            print(f"[crawl] {source_row['sourceType']}: {crawl_result}")

            if crawl_result["status"] != "success":
                continue

            # Scoped to exactly the snapshot rows this run's own crawl just
            # inserted (crawl_result["snapshotIds"]), not "every snapshot
            # ever recorded for this source" -- raw_job_snapshots is an
            # intentional append-only history log that keeps every past
            # crawl's rows forever (see runner.run_crawl), so re-fetching
            # and re-normalizing the whole history on every 4-hourly
            # invocation grows unbounded with total crawl count and was
            # the main driver of the worker machine's OOM. Re-normalizing
            # the same job repeatedly is otherwise harmless (upsert keyed
            # on sourceId+originalJobId), but doing it for the entire
            # history every run is pure waste.
            if not crawl_result["snapshotIds"]:
                continue

            snap_cur = db.dict_cursor(conn)
            snap_cur.execute(
                'SELECT * FROM "raw_job_snapshots" WHERE "id" = ANY(%s)', (crawl_result["snapshotIds"],)
            )
            snapshots = snap_cur.fetchall()
            normalize_result = run_normalizer(conn, source_row, snapshots)
            conn.commit()
            print(f"[normalize] {source_row['sourceType']}: {normalize_result}")

        dedup_result = run_dedup(conn)
        conn.commit()
        print(f"[dedup] {dedup_result}")

        near_dup_result = run_near_duplicate_clustering(conn)
        conn.commit()
        print(f"[near-dedup] {near_dup_result}")
        return 0
    except Exception:  # noqa: BLE001
        conn.rollback()
        raise
    finally:
        conn.close()


if __name__ == "__main__":
    sys.exit(main())
