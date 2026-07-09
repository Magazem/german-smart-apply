"""Integration tests for crawler.runner: a crawl run should be recorded in
source_crawl_runs and every fetched payload persisted to raw_job_snapshots.
Runs against the real local Postgres (via the pg_conn/seeded_sources
fixtures), inside a transaction that's rolled back afterwards.
"""
from __future__ import annotations

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


def test_run_crawl_second_run_marks_existing_jobs_as_updated(seeded_sources):
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

    second = runner.run_crawl(conn, client, source_row)
    assert second["jobsNew"] == 0
    assert second["jobsUpdated"] == 2

    cur.execute('SELECT COUNT(*) FROM "raw_job_snapshots" WHERE "sourceId" = %s', (source_id,))
    assert cur.fetchone()[0] == 4  # both crawl runs persisted their own snapshot rows


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
