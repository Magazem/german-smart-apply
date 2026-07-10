"""Real end-to-end test against the local Postgres instance: seeds fixture
jobs through the full snapshot -> normalize -> dedup pipeline (including one
exact duplicate of another job posted under a different source) and asserts
exactly one canonical_jobs row exists for the duplicate pair, with a populated
duplicate_clusters/duplicate_cluster_members trail.
"""
from __future__ import annotations

import psycopg2.extras

from crawler import greenhouse, lever, runner
from deduplicator import dedup
from normalizer import pipeline
from tests.conftest import load_fixture
from tests.fakes import FakeClient, FakeResponse


def _load_source_row(conn, db_id: str) -> dict:
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    cur.execute('SELECT * FROM "sources" WHERE "id" = %s', (db_id,))
    return cur.fetchone()


def test_full_pipeline_snapshot_to_normalize_to_dedup_collapses_duplicate(seeded_db):
    conn, source_ids = seeded_db
    cur = conn.cursor()

    gh_source_id = source_ids["greenhouse-de"]
    lever_source_id = source_ids["lever-de"]

    # Configure greenhouse-de with one board token ("acme") and lever-de with
    # a matching site slug, so both sources crawl "the same company".
    cur.execute('UPDATE "sources" SET "config" = %s WHERE "id" = %s', ('{"boardTokens": ["acme"]}', gh_source_id))
    cur.execute('UPDATE "sources" SET "config" = %s WHERE "id" = %s', ('{"siteSlugs": ["acme"]}', lever_source_id))

    gh_source_row = _load_source_row(conn, gh_source_id)
    lever_source_row = _load_source_row(conn, lever_source_id)

    # --- Step 1: crawl (snapshot) ---
    # greenhouse fixture has 2 jobs: a Senior Backend Engineer in Berlin (the
    # job we'll duplicate) and an unrelated Werkstudent Marketing role.
    gh_fixture = load_fixture("greenhouse_jobs.json")
    gh_url = greenhouse._board_url("acme")
    gh_client = FakeClient({gh_url: FakeResponse(gh_fixture)})
    gh_result = runner.run_crawl(conn, gh_client, gh_source_row)
    assert gh_result["status"] == "success"
    assert gh_result["jobsFetched"] == 2

    # lever fixture has 1 job: the *same* Senior Backend Engineer at Acme in
    # Berlin, posted independently through Lever -- an exact duplicate once
    # normalized (same company, same title after stripping "(m/w/d)", same
    # location), even though the two ATSs assign it unrelated ids.
    lever_fixture = load_fixture("lever_postings.json")
    lever_url = lever._postings_url("acme")
    lever_client = FakeClient({lever_url: FakeResponse(lever_fixture)})
    lever_result = runner.run_crawl(conn, lever_client, lever_source_row)
    assert lever_result["status"] == "success"
    assert lever_result["jobsFetched"] == 1

    cur.execute('SELECT COUNT(*) FROM "raw_job_snapshots"')
    assert cur.fetchone()[0] == 3

    # --- Step 2: normalize ---
    dict_cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    dict_cur.execute('SELECT * FROM "raw_job_snapshots" WHERE "sourceId" = %s', (gh_source_id,))
    gh_snapshots = dict_cur.fetchall()
    dict_cur.execute('SELECT * FROM "raw_job_snapshots" WHERE "sourceId" = %s', (lever_source_id,))
    lever_snapshots = dict_cur.fetchall()

    gh_norm_result = pipeline.run_normalizer(conn, gh_source_row, gh_snapshots)
    lever_norm_result = pipeline.run_normalizer(conn, lever_source_row, lever_snapshots)
    assert gh_norm_result["rawJobsWritten"] == 2
    assert lever_norm_result["rawJobsWritten"] == 1

    cur.execute('SELECT COUNT(*) FROM "raw_jobs"')
    assert cur.fetchone()[0] == 3

    # Sanity check: normalization actually collapsed the two postings onto
    # identical (companyNameNormalized, jobTitleNormalized, locationNormalized)
    # -- otherwise dedup wouldn't be expected to collapse them.
    dict_cur.execute(
        """
        SELECT "companyNameNormalized", "jobTitleNormalized", "locationNormalized", COUNT(*) AS cnt
        FROM "raw_jobs"
        GROUP BY 1, 2, 3
        HAVING COUNT(*) > 1
        """
    )
    duplicate_groups = dict_cur.fetchall()
    assert len(duplicate_groups) == 1
    assert duplicate_groups[0]["cnt"] == 2

    # --- Step 3: dedup ---
    dedup_result = dedup.run_dedup(conn)
    assert dedup_result["rawJobsProcessed"] == 3
    assert dedup_result["groups"] == 2  # {Senior Backend Engineer, Berlin} and {Werkstudent Marketing, Remote}
    assert dedup_result["canonicalJobsCreated"] == 2
    # Every cluster key gets a duplicate_clusters row from its first sighting
    # (even the solo Werkstudent Marketing one) so a cross-run duplicate can
    # be found and folded in later - see dedup.py's module docstring.
    assert dedup_result["duplicateClustersCreated"] == 2
    assert dedup_result["duplicateClusterMembersCreated"] == 3

    # Exactly one canonical_jobs row for the duplicate pair.
    dict_cur.execute(
        """
        SELECT cj.* FROM "canonical_jobs" cj
        WHERE cj."jobTitleNormalized" = %s AND cj."locationNormalized" = %s
        """,
        ("senior backend engineer", "Berlin"),
    )
    canonical_rows = dict_cur.fetchall()
    assert len(canonical_rows) == 1
    canonical_job = canonical_rows[0]

    # A populated duplicate_clusters / duplicate_cluster_members trail exists
    # for that canonical job, covering both raw_jobs that fed into it.
    dict_cur.execute('SELECT * FROM "duplicate_clusters" WHERE "canonicalJobId" = %s', (canonical_job["id"],))
    clusters = dict_cur.fetchall()
    assert len(clusters) == 1

    dict_cur.execute(
        'SELECT * FROM "duplicate_cluster_members" WHERE "duplicateClusterId" = %s', (clusters[0]["id"],)
    )
    members = dict_cur.fetchall()
    assert len(members) == 2
    assert sum(1 for m in members if m["isCanonicalPick"]) == 1

    member_raw_job_ids = {m["rawJobId"] for m in members}
    cur.execute(
        'SELECT "id", "sourceId" FROM "raw_jobs" WHERE "id" = ANY(%s)',
        (list(member_raw_job_ids),),
    )
    sources_of_members = {row[1] for row in cur.fetchall()}
    assert sources_of_members == {gh_source_id, lever_source_id}

    # The unrelated Werkstudent Marketing job got its own canonical_jobs row,
    # with its own "cluster of one" (populated eagerly so a future cross-run
    # duplicate of *this* job could still be found and collapsed later).
    dict_cur.execute(
        'SELECT * FROM "canonical_jobs" WHERE "jobTitleNormalized" = %s', ("werkstudent marketing",)
    )
    solo_canonical = dict_cur.fetchall()
    assert len(solo_canonical) == 1
    dict_cur.execute(
        'SELECT * FROM "duplicate_clusters" WHERE "canonicalJobId" = %s', (solo_canonical[0]["id"],)
    )
    solo_clusters = dict_cur.fetchall()
    assert len(solo_clusters) == 1
    dict_cur.execute(
        'SELECT * FROM "duplicate_cluster_members" WHERE "duplicateClusterId" = %s',
        (solo_clusters[0]["id"],),
    )
    solo_members = dict_cur.fetchall()
    assert len(solo_members) == 1
    assert solo_members[0]["isCanonicalPick"] is True
