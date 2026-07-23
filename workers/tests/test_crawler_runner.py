"""Integration tests for crawler.runner: a crawl run should be recorded in
source_crawl_runs and each fetched payload persisted to raw_job_snapshots -
but only when it differs from the last payload stored for that job.
Runs against the real local Postgres (via the pg_conn/seeded_sources
fixtures), inside a transaction that's rolled back afterwards.
"""
from __future__ import annotations

import json

from common import db
from crawler import greenhouse, runner
from tests.conftest import load_fixture
from tests.fakes import FakeClient, FakeResponse


def _load_source_row(conn, db_id: str) -> dict:
    cur = db.dict_cursor(conn)
    cur.execute('SELECT * FROM "sources" WHERE "id" = %s', (db_id,))
    return cur.fetchone()


def test_run_crawl_records_run_and_snapshots(seeded_sources):
    conn, source_ids = seeded_sources
    source_id = source_ids["greenhouse-de"]

    cur = conn.cursor()
    cur.execute('UPDATE "sources" SET "config" = %s WHERE "id" = %s', ('{"boardTokens": ["acme"]}', source_id))

    source_row = _load_source_row(conn, source_id)
    fixture = load_fixture("greenhouse_jobs.json")
    url = greenhouse._board_url("acme")
    client = FakeClient({url: FakeResponse(fixture)})

    result = runner.run_crawl(conn, client, source_row)

    assert result["status"] == "success"
    assert result["jobsFetched"] == 2
    assert result["jobsNew"] == 2
    assert result["jobsUpdated"] == 0

    cur.execute('SELECT COUNT(*) FROM "raw_job_snapshots" WHERE "sourceId" = %s', (source_id,))
    assert cur.fetchone()[0] == 2

    # snapshotIds must be exactly the rows this call inserted, not "every
    # snapshot for this source" - run_pipeline.py relies on this list to
    # avoid re-fetching/re-normalizing the source's whole history every run.
    assert len(result["snapshotIds"]) == 2
    cur.execute('SELECT "id" FROM "raw_job_snapshots" WHERE "sourceId" = %s', (source_id,))
    assert {row[0] for row in cur.fetchall()} == set(result["snapshotIds"])

    cur.execute(
        'SELECT "status", "jobsFetched", "jobsNew", "jobsUpdated", "retryCount" FROM "source_crawl_runs" WHERE "id" = %s',
        (result["run_id"],),
    )
    row = cur.fetchone()
    assert row[0] == "success"
    assert row[1] == 2
    assert row[2] == 2
    assert row[3] == 0
    assert row[4] == 0


def test_run_crawl_second_run_with_unchanged_payloads_writes_no_new_snapshots(seeded_sources):
    """Re-crawling a source whose postings haven't changed must not grow
    raw_job_snapshots. Re-capturing identical payloads every 4h is what took
    that table to 748k rows for 14.5k distinct payloads (~3.5 GB on Neon).
    """
    conn, source_ids = seeded_sources
    source_id = source_ids["greenhouse-de"]

    cur = conn.cursor()
    cur.execute('UPDATE "sources" SET "config" = %s WHERE "id" = %s', ('{"boardTokens": ["acme"]}', source_id))
    source_row = _load_source_row(conn, source_id)

    fixture = load_fixture("greenhouse_jobs.json")
    url = greenhouse._board_url("acme")
    client = FakeClient({url: FakeResponse(fixture)})

    first = runner.run_crawl(conn, client, source_row)
    assert first["jobsNew"] == 2
    assert first["jobsUpdated"] == 0
    assert first["jobsUnchanged"] == 0

    second = runner.run_crawl(conn, client, source_row)
    assert second["jobsNew"] == 0
    assert second["jobsUpdated"] == 0  # nothing actually changed...
    assert second["jobsUnchanged"] == 2  # ...it was the same payload twice

    cur.execute('SELECT COUNT(*) FROM "raw_job_snapshots" WHERE "sourceId" = %s', (source_id,))
    assert cur.fetchone()[0] == 2  # still just the first run's rows

    # The second run still reports one snapshot id per job fetched - reusing
    # the existing rows' ids - so run_pipeline.py normalizes exactly the same
    # set of jobs it would have before dedup. Skipping the write must be
    # invisible downstream.
    assert second["snapshotIds"] == first["snapshotIds"]


def test_run_crawl_persists_a_new_snapshot_when_a_payload_actually_changes(seeded_sources):
    """The flip side of dedup: a genuine edit to a posting must still be
    captured as its own row, so the history remains a real change log.
    """
    conn, source_ids = seeded_sources
    source_id = source_ids["greenhouse-de"]

    cur = conn.cursor()
    cur.execute('UPDATE "sources" SET "config" = %s WHERE "id" = %s', ('{"boardTokens": ["acme"]}', source_id))
    source_row = _load_source_row(conn, source_id)

    fixture = load_fixture("greenhouse_jobs.json")
    url = greenhouse._board_url("acme")

    first = runner.run_crawl(conn, client=FakeClient({url: FakeResponse(fixture)}), source_row=source_row)
    assert first["jobsNew"] == 2

    # Same jobs, but one of them had its title edited upstream.
    edited = json.loads(json.dumps(fixture))
    edited["jobs"][0]["title"] = edited["jobs"][0]["title"] + " (Updated)"

    second = runner.run_crawl(conn, client=FakeClient({url: FakeResponse(edited)}), source_row=source_row)
    assert second["jobsNew"] == 0
    assert second["jobsUpdated"] == 1  # the edited posting
    assert second["jobsUnchanged"] == 1  # the untouched one

    cur.execute('SELECT COUNT(*) FROM "raw_job_snapshots" WHERE "sourceId" = %s', (source_id,))
    assert cur.fetchone()[0] == 3  # 2 originals + 1 new version of the edited job

    # Still one id per job fetched, and the changed job points at its new row.
    assert len(second["snapshotIds"]) == 2
    assert len(set(second["snapshotIds"]) - set(first["snapshotIds"])) == 1


def test_run_crawl_stores_a_payload_hash_for_new_snapshots(seeded_sources):
    """The dedup comparison relies on "payloadHash" matching what Postgres
    computes over the stored JSONB. Hashing in Python would silently never
    match (JSONB is re-serialized on the way in), defeating dedup entirely.
    """
    conn, source_ids = seeded_sources
    source_id = source_ids["greenhouse-de"]

    cur = conn.cursor()
    cur.execute('UPDATE "sources" SET "config" = %s WHERE "id" = %s', ('{"boardTokens": ["acme"]}', source_id))
    source_row = _load_source_row(conn, source_id)

    fixture = load_fixture("greenhouse_jobs.json")
    url = greenhouse._board_url("acme")
    runner.run_crawl(conn, FakeClient({url: FakeResponse(fixture)}), source_row)

    cur.execute(
        'SELECT COUNT(*) FROM "raw_job_snapshots" '
        'WHERE "sourceId" = %s AND "payloadHash" IS DISTINCT FROM md5("payload"::text)',
        (source_id,),
    )
    assert cur.fetchone()[0] == 0


def test_run_crawl_dedups_against_legacy_rows_that_have_no_stored_hash(seeded_sources):
    """Rows written before "payloadHash" existed are left NULL on purpose (the
    migration deliberately skips backfilling ~748k TOASTed rows). Dedup must
    still recognize them, or the first crawl after deploy would duplicate the
    entire table one last time.
    """
    conn, source_ids = seeded_sources
    source_id = source_ids["greenhouse-de"]

    cur = conn.cursor()
    cur.execute('UPDATE "sources" SET "config" = %s WHERE "id" = %s', ('{"boardTokens": ["acme"]}', source_id))
    source_row = _load_source_row(conn, source_id)

    fixture = load_fixture("greenhouse_jobs.json")
    url = greenhouse._board_url("acme")
    client = FakeClient({url: FakeResponse(fixture)})

    runner.run_crawl(conn, client, source_row)
    # Simulate pre-migration rows.
    cur.execute('UPDATE "raw_job_snapshots" SET "payloadHash" = NULL WHERE "sourceId" = %s', (source_id,))

    second = runner.run_crawl(conn, client, source_row)
    assert second["jobsUnchanged"] == 2
    assert second["jobsUpdated"] == 0

    cur.execute('SELECT COUNT(*) FROM "raw_job_snapshots" WHERE "sourceId" = %s', (source_id,))
    assert cur.fetchone()[0] == 2


def test_run_crawl_records_failure_on_domain_violation(seeded_sources):
    conn, source_ids = seeded_sources
    source_id = source_ids["greenhouse-de"]

    cur = conn.cursor()
    cur.execute(
        'UPDATE "sources" SET "config" = %s, "domainAllowlist" = %s WHERE "id" = %s',
        ('{"boardTokens": ["acme"]}', ["not-greenhouse.example"], source_id),
    )
    source_row = _load_source_row(conn, source_id)
    client = FakeClient()

    result = runner.run_crawl(conn, client, source_row)

    assert result["status"] == "failure"
    assert client.calls == []

    cur.execute('SELECT "status", "errorLog" FROM "source_crawl_runs" WHERE "id" = %s', (result["run_id"],))
    row = cur.fetchone()
    assert row[0] == "failure"
    assert row[1] is not None


def test_run_crawl_records_failure_for_an_unregistered_adapter_instead_of_crashing(seeded_sources):
    """A source row with a sourceType no adapter is registered for (a config
    mistake, or a new source added to market_de before its adapter module
    exists) must degrade to a recorded failed run - the same resilience
    guarantee as any other adapter-side exception - not take down the whole
    crawl process for every other source.
    """
    conn, source_ids = seeded_sources
    source_id = source_ids["greenhouse-de"]

    cur = conn.cursor()
    cur.execute('UPDATE "sources" SET "sourceType" = %s WHERE "id" = %s', ("unknown-board", source_id))
    source_row = _load_source_row(conn, source_id)
    client = FakeClient()

    result = runner.run_crawl(conn, client, source_row)

    assert result["status"] == "failure"
    assert "unknown-board" in result["error"]
    assert client.calls == []

    cur.execute('SELECT "status", "errorLog" FROM "source_crawl_runs" WHERE "id" = %s', (result["run_id"],))
    row = cur.fetchone()
    assert row[0] == "failure"
    assert "unknown-board" in row[1]
