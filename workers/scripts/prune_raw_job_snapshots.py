"""One-off reclaim for the raw_job_snapshots bloat.

Background: until the crawler learned to dedup (crawler/runner.py), every
4-hourly crawl re-inserted a full JSON payload for every job it saw, even when
the payload was byte-identical to the one already stored. On production that
produced 748,572 rows holding 14,560 distinct payloads -- ~98% exact
duplicates, ~2.9 GB of TOAST, and a 3.5 GB database.

This script collapses *consecutive* identical payloads per
(sourceId, originalJobId), keeping the first row of every run of identical
payloads. That is deliberately the same policy the crawler now applies going
forward, so history stays consistent across the cutover. Keeping only the
newest row per job would instead silently discard the genuine change history
this table exists for.

Why a table rewrite instead of DELETE + VACUUM FULL: on Neon a DELETE does not
shrink storage at all (you still need a rewrite to reclaim), and deleting 734k
TOASTed rows then rewriting writes far more WAL than simply building the
~14.5k-row replacement table and swapping it in.

Safety:
  * Dry-run by default. Pass --apply to actually swap tables.
  * Refuses to run unless the payloadHash migration is applied.
  * The swap runs in one transaction: on any error nothing changes.
  * It takes an ACCESS EXCLUSIVE lock up front and holds it across the whole
    rewrite, so a concurrently-committing crawl cannot have its rows silently
    dropped (see the comment in _apply). Run it with the crawler paused; if a
    crawl is live this fails fast on lock_timeout instead of eating data.
  * Nothing in the schema references raw_job_snapshots via an incoming FK
    (verified below at runtime), so the swap cannot orphan another table.

Usage:
    python -m scripts.prune_raw_job_snapshots            # report only
    python -m scripts.prune_raw_job_snapshots --apply    # do it
"""
from __future__ import annotations

import argparse
import os
import sys

import psycopg2

# Rows to KEEP: the first row of each run of consecutive identical payloads
# for a given (sourceId, originalJobId), ordered by capture time.
KEEPERS_CTE = """
WITH ordered AS (
    SELECT "id",
           md5("payload"::text) AS h,
           lag(md5("payload"::text)) OVER (
               PARTITION BY "sourceId", "originalJobId"
               ORDER BY "fetchedAt", "id"
           ) AS prev_h
    FROM "raw_job_snapshots"
)
SELECT "id" FROM ordered WHERE prev_h IS DISTINCT FROM h
"""


def _require_migration(cur) -> None:
    cur.execute(
        """
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'raw_job_snapshots' AND column_name = 'payloadHash'
        """
    )
    if cur.fetchone() is None:
        sys.exit(
            "refusing to run: the payloadHash column is missing. Apply the\n"
            "20260723140000_add_raw_job_snapshot_payload_hash migration first,\n"
            "and deploy the dedup-aware crawler, so the table stops re-growing\n"
            "the moment this finishes."
        )


def _require_no_incoming_fks(cur) -> None:
    """The swap drops the old table. If anything ever gains an FK referencing
    it, dropping would cascade or fail -- fail loudly instead of guessing."""
    cur.execute(
        """
        SELECT c.conname, c.conrelid::regclass::text
        FROM pg_constraint c
        WHERE c.contype = 'f'
          AND c.confrelid = 'raw_job_snapshots'::regclass
        """
    )
    rows = cur.fetchall()
    if rows:
        sys.exit(
            "refusing to run: raw_job_snapshots now has incoming foreign keys "
            f"({rows}); the table-swap strategy is no longer safe. Re-do this "
            "as a DELETE + VACUUM FULL, or drop/recreate those constraints."
        )


def _report(cur) -> tuple[int, int]:
    cur.execute('SELECT count(*) FROM "raw_job_snapshots"')
    total = cur.fetchone()[0]
    cur.execute(f"SELECT count(*) FROM ({KEEPERS_CTE}) k")
    keepers = cur.fetchone()[0]

    cur.execute("SELECT pg_size_pretty(pg_total_relation_size('raw_job_snapshots'))")
    size = cur.fetchone()[0]
    cur.execute("SELECT pg_size_pretty(pg_database_size(current_database()))")
    db_size = cur.fetchone()[0]

    dropped = total - keepers
    pct = (dropped / total * 100) if total else 0.0
    print(f"database size          : {db_size}")
    print(f"raw_job_snapshots size : {size}")
    print(f"rows total             : {total:,}")
    print(f"rows to keep           : {keepers:,}")
    print(f"rows to drop           : {dropped:,} ({pct:.1f}%)")
    return total, keepers


def _apply(conn, cur) -> None:
    # Take the exclusive lock BEFORE reading, and hold it for the whole
    # transaction. Without this there is a silent data-loss window that the
    # single transaction does NOT close: CREATE TABLE AS SELECT reads a
    # READ COMMITTED snapshot, so any row a crawl commits after that snapshot
    # but before the DROP below exists only in the old table and disappears
    # with it. A lock taken only at DROP time would not catch it either -- a
    # quick insert commits and releases its own lock long before we get there.
    # If a crawl is running, lock_timeout makes this fail fast and roll back
    # cleanly rather than silently eating that crawl's rows.
    print("\nacquiring exclusive lock on raw_job_snapshots ...")
    cur.execute('LOCK TABLE "raw_job_snapshots" IN ACCESS EXCLUSIVE MODE')

    print("building replacement table ...")
    # LOGGED (the default) on purpose: an UNLOGGED table would be emptied by a
    # Neon compute restart mid-swap, silently destroying the history.
    cur.execute(
        f"""
        CREATE TABLE "raw_job_snapshots_new" AS
        SELECT "id", "sourceId", "originalJobId", "payload",
               md5("payload"::text) AS "payloadHash", "fetchedAt"
        FROM "raw_job_snapshots"
        WHERE "id" IN ({KEEPERS_CTE})
        """
    )
    cur.execute('SELECT count(*) FROM "raw_job_snapshots_new"')
    print(f"  copied {cur.fetchone()[0]:,} rows")

    print("restoring constraints and indexes ...")
    cur.execute(
        'ALTER TABLE "raw_job_snapshots_new" '
        'ALTER COLUMN "id" SET NOT NULL, '
        'ALTER COLUMN "sourceId" SET NOT NULL, '
        'ALTER COLUMN "originalJobId" SET NOT NULL, '
        'ALTER COLUMN "payload" SET NOT NULL, '
        'ALTER COLUMN "fetchedAt" SET NOT NULL, '
        'ALTER COLUMN "fetchedAt" SET DEFAULT CURRENT_TIMESTAMP'
    )
    # Constraint and index names are unique per schema, not per table, so the
    # new table cannot claim the canonical names while the old table still
    # holds them. Build under temporary names, then rename after the drop --
    # Prisma matches on these names, so ending up with "_new" suffixes would
    # make the next migrate/diff think the indexes are missing.
    cur.execute(
        'ALTER TABLE "raw_job_snapshots_new" '
        'ADD CONSTRAINT "raw_job_snapshots_new_pkey" PRIMARY KEY ("id")'
    )
    cur.execute(
        'ALTER TABLE "raw_job_snapshots_new" '
        'ADD CONSTRAINT "raw_job_snapshots_new_sourceId_fkey" '
        'FOREIGN KEY ("sourceId") REFERENCES "sources"("id") '
        "ON DELETE CASCADE ON UPDATE CASCADE"
    )
    # Only the 3-column index: the old (sourceId, originalJobId) index is an
    # exact prefix of it and is dropped by the payloadHash migration.
    cur.execute(
        'CREATE INDEX "raw_job_snapshots_new_sourceId_originalJobId_fetchedAt_idx" '
        'ON "raw_job_snapshots_new"("sourceId", "originalJobId", "fetchedAt" DESC)'
    )

    print("swapping tables ...")
    cur.execute('DROP TABLE "raw_job_snapshots"')
    cur.execute('ALTER TABLE "raw_job_snapshots_new" RENAME TO "raw_job_snapshots"')
    cur.execute(
        'ALTER TABLE "raw_job_snapshots" '
        'RENAME CONSTRAINT "raw_job_snapshots_new_pkey" TO "raw_job_snapshots_pkey"'
    )
    cur.execute(
        'ALTER TABLE "raw_job_snapshots" '
        'RENAME CONSTRAINT "raw_job_snapshots_new_sourceId_fkey" '
        'TO "raw_job_snapshots_sourceId_fkey"'
    )
    cur.execute(
        'ALTER INDEX "raw_job_snapshots_new_sourceId_originalJobId_fetchedAt_idx" '
        'RENAME TO "raw_job_snapshots_sourceId_originalJobId_fetchedAt_idx"'
    )

    conn.commit()
    print("committed.\n")

    # The rebuilt table has no statistics until autovacuum gets to it; give
    # the planner something to work with immediately.
    conn.autocommit = True
    cur.execute('ANALYZE "raw_job_snapshots"')
    conn.autocommit = False

    cur.execute("SELECT pg_size_pretty(pg_total_relation_size('raw_job_snapshots'))")
    print(f"raw_job_snapshots size : {cur.fetchone()[0]}")
    cur.execute("SELECT pg_size_pretty(pg_database_size(current_database()))")
    print(f"database size          : {cur.fetchone()[0]}")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--apply",
        action="store_true",
        help="actually rewrite the table (default is a read-only report)",
    )
    args = parser.parse_args()

    url = os.environ.get("DATABASE_URL")
    if not url:
        sys.exit("DATABASE_URL is not set")

    conn = psycopg2.connect(url)
    try:
        cur = conn.cursor()
        _require_migration(cur)
        _require_no_incoming_fks(cur)
        _report(cur)

        if not args.apply:
            print("\ndry run - nothing changed. Re-run with --apply to rewrite.")
            return 0

        # The swap takes an ACCESS EXCLUSIVE lock and drops the old table.
        # Don't race a running crawl: this should be run with the crawler
        # paused. Fail fast rather than queueing behind a long-held lock.
        cur.execute("SET lock_timeout = '30s'")
        _apply(conn, cur)
        return 0
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


if __name__ == "__main__":
    sys.exit(main())
