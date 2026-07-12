"""Tests for near-duplicate clustering (deduplicator.near_duplicates).

Pure-function similarity tests need no DB. run_near_duplicate_clustering
itself needs real Postgres (via seeded_db) since it reads/writes
canonical_jobs/duplicate_clusters/duplicate_cluster_members, and calls
dedup.run_dedup() first to get from raw_jobs to canonical_jobs the same way
the real pipeline does.
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone

import psycopg2.extras

from deduplicator import dedup, near_duplicates
from tests.helpers import insert_raw_job

# ---------------------------------------------------------------------------
# Pure-function similarity scoring
# ---------------------------------------------------------------------------


def test_similarity_is_1_for_identical_title_and_description():
    job = {
        "jobTitleNormalized": "senior backend engineer",
        "jobDescriptionText": "We are looking for a Senior Backend Engineer with Python experience.",
    }
    assert near_duplicates.similarity(job, dict(job)) == 1.0


def test_similarity_is_0_for_completely_unrelated_title_and_description():
    job_a = {
        "jobTitleNormalized": "senior backend engineer",
        "jobDescriptionText": "We are looking for a Senior Backend Engineer with Python experience.",
    }
    job_b = {
        "jobTitleNormalized": "warehouse logistics coordinator",
        "jobDescriptionText": "We need someone to manage inbound shipments and pallet inventory daily.",
    }
    assert near_duplicates.similarity(job_a, job_b) == 0.0


def test_similarity_falls_back_to_title_only_when_description_too_short_to_shingle():
    job_a = {"jobTitleNormalized": "senior backend engineer", "jobDescriptionText": "Apply now."}
    job_b = {"jobTitleNormalized": "senior backend engineer", "jobDescriptionText": "Join us."}
    # Both descriptions are below MIN_DESCRIPTION_TOKENS -- title-only signal.
    assert near_duplicates.similarity(job_a, job_b) == 1.0


def test_jaccard_returns_zero_when_either_set_is_empty():
    # similarity()'s own title/description guards mean an empty *description*
    # shingle set never reaches _jaccard (it short-circuits to title-only
    # first) - but an empty *title* token set (a job with a blank
    # jobTitleNormalized) does reach this exact function, so it's tested
    # directly here rather than only indirectly through similarity().
    assert near_duplicates._jaccard(set(), {"a", "b"}) == 0.0
    assert near_duplicates._jaccard({"a", "b"}, set()) == 0.0
    assert near_duplicates._jaccard(set(), set()) == 0.0


def test_similarity_title_only_when_one_description_is_too_short_and_the_other_is_not():
    """_jaccard's empty-set guard: a substantial description compared against
    a too-short-to-shingle one must fall back to title-only, not divide by a
    partial/lopsided shingle overlap.
    """
    job_a = {"jobTitleNormalized": "senior backend engineer", "jobDescriptionText": "Apply now."}
    job_b = {
        "jobTitleNormalized": "senior backend engineer",
        "jobDescriptionText": (
            "We are looking for a Senior Backend Engineer with strong Python and "
            "PostgreSQL experience to join our growing platform team in Berlin."
        ),
    }
    assert near_duplicates.similarity(job_a, job_b) == 1.0  # title-only signal, both titles identical


def test_similarity_scores_a_reworded_near_duplicate_above_threshold():
    job_a = {
        "jobTitleNormalized": "senior backend engineer",
        "jobDescriptionText": (
            "We are looking for a Senior Backend Engineer with strong Python and "
            "PostgreSQL experience to join our growing platform team in Berlin."
        ),
    }
    # Same title tokens in a different order (title Jaccard is set-based, so
    # this scores identically to an exact match) plus a near-identical
    # description with one word inserted -- the realistic "same posting,
    # different ATS formatting" case.
    job_b = {
        "jobTitleNormalized": "backend engineer senior",
        "jobDescriptionText": (
            "We are looking for a Senior Backend Engineer with strong Python and "
            "PostgreSQL experience to join our growing platform team based in Berlin."
        ),
    }
    score = near_duplicates.similarity(job_a, job_b)
    assert score >= near_duplicates.SIMILARITY_THRESHOLD


def test_similarity_of_a_word_substituted_title_with_minor_description_edits_stays_below_threshold():
    """Guards the threshold/weight choice itself: a substituted title word
    (not just reordered) combined with a minor description edit should NOT
    clear the bar - if this ever starts failing because the constants
    changed, that's a signal to re-examine false-positive risk, not to
    "fix" the test.
    """
    job_a = {
        "jobTitleNormalized": "senior backend engineer",
        "jobDescriptionText": (
            "We are looking for a Senior Backend Engineer with strong Python and "
            "PostgreSQL experience to join our growing platform team in Berlin."
        ),
    }
    job_b = {
        "jobTitleNormalized": "senior backend developer",
        "jobDescriptionText": (
            "We are looking for a Senior Backend Engineer with strong Python and "
            "PostgreSQL experience to join our growing platform team based in Berlin."
        ),
    }
    score = near_duplicates.similarity(job_a, job_b)
    assert score < near_duplicates.SIMILARITY_THRESHOLD


# ---------------------------------------------------------------------------
# run_near_duplicate_clustering (needs Postgres)
# ---------------------------------------------------------------------------

_REWORDED_DESCRIPTION_A = (
    "We are looking for a Senior Backend Engineer with strong Python and "
    "PostgreSQL experience to join our growing platform team in Berlin."
)
_REWORDED_DESCRIPTION_B = (
    "We are looking for a Senior Backend Engineer with strong Python and "
    "PostgreSQL experience to join our growing platform team based in Berlin."
)


def test_merges_reworded_near_duplicate_at_same_company_and_location(seeded_db):
    conn, source_ids = seeded_db
    cur = conn.cursor()

    insert_raw_job(
        cur, source_ids["greenhouse-de"], originalJobId="gh-1",
        jobTitleNormalized="senior backend engineer", jobDescriptionText=_REWORDED_DESCRIPTION_A,
    )
    insert_raw_job(
        cur, source_ids["lever-de"], originalJobId="lv-1",
        sourceUrl="https://jobs.lever.co/acme/reworded",
        jobTitleNormalized="backend engineer senior", jobDescriptionText=_REWORDED_DESCRIPTION_B,
    )
    dedup.run_dedup(conn)

    dict_cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    dict_cur.execute('SELECT * FROM "canonical_jobs"')
    assert len(dict_cur.fetchall()) == 2  # exact dedup alone must NOT merge these

    result = near_duplicates.run_near_duplicate_clustering(conn)
    assert result["nearDuplicateClustersCreated"] == 1
    assert result["jobsHidden"] == 1

    dict_cur.execute('SELECT * FROM "canonical_jobs" WHERE "isVisible" = true')
    visible = dict_cur.fetchall()
    assert len(visible) == 1
    assert visible[0]["duplicateConfidence"] < 1.0


def test_does_not_merge_genuinely_different_roles_at_the_same_company_and_location(seeded_db):
    conn, source_ids = seeded_db
    cur = conn.cursor()

    insert_raw_job(
        cur, source_ids["greenhouse-de"], originalJobId="gh-backend",
        jobTitleNormalized="senior backend engineer", jobDescriptionText=_REWORDED_DESCRIPTION_A,
    )
    insert_raw_job(
        cur, source_ids["greenhouse-de"], originalJobId="gh-warehouse",
        jobTitleNormalized="warehouse logistics coordinator",
        jobDescriptionText="We need someone to manage inbound shipments and pallet inventory daily.",
    )
    dedup.run_dedup(conn)

    result = near_duplicates.run_near_duplicate_clustering(conn)
    assert result["nearDuplicateClustersCreated"] == 0
    assert result["jobsHidden"] == 0

    dict_cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    dict_cur.execute('SELECT * FROM "canonical_jobs" WHERE "isVisible" = true')
    assert len(dict_cur.fetchall()) == 2


def test_does_not_merge_identical_wording_across_different_companies(seeded_db):
    """The critical safety case: two unrelated employers happening to reuse
    near-identical boilerplate (common with template job ads) must NOT be
    merged - that would hide one of two genuinely distinct real listings.
    """
    conn, source_ids = seeded_db
    cur = conn.cursor()

    insert_raw_job(
        cur, source_ids["greenhouse-de"], originalJobId="gh-company-a",
        companyNameRaw="Acme GmbH", companyNameNormalized="acme",
        jobTitleNormalized="senior backend engineer", jobDescriptionText=_REWORDED_DESCRIPTION_A,
    )
    insert_raw_job(
        cur, source_ids["greenhouse-de"], originalJobId="gh-company-b",
        companyNameRaw="Beta AG", companyNameNormalized="beta",
        jobTitleNormalized="senior backend engineer", jobDescriptionText=_REWORDED_DESCRIPTION_A,
    )
    dedup.run_dedup(conn)

    result = near_duplicates.run_near_duplicate_clustering(conn)
    assert result["nearDuplicateClustersCreated"] == 0
    assert result["jobsHidden"] == 0


def test_does_not_merge_identical_wording_across_different_locations(seeded_db):
    """Mirrors the Ferchau branch-office concern for company aliases: same
    company, same near-identical wording, but two genuinely different open
    roles in two different cities must stay separate.
    """
    conn, source_ids = seeded_db
    cur = conn.cursor()

    insert_raw_job(
        cur, source_ids["greenhouse-de"], originalJobId="gh-berlin",
        jobTitleNormalized="senior backend engineer", jobDescriptionText=_REWORDED_DESCRIPTION_A,
        locationNormalized="Berlin",
    )
    insert_raw_job(
        cur, source_ids["greenhouse-de"], originalJobId="gh-munich",
        jobTitleNormalized="senior backend engineer", jobDescriptionText=_REWORDED_DESCRIPTION_A,
        locationNormalized="Munich",
    )
    dedup.run_dedup(conn)

    result = near_duplicates.run_near_duplicate_clustering(conn)
    assert result["nearDuplicateClustersCreated"] == 0
    assert result["jobsHidden"] == 0


def test_picks_higher_trust_source_as_the_visible_survivor(seeded_db):
    conn, source_ids = seeded_db
    cur = conn.cursor()

    cur.execute('UPDATE "sources" SET "trustTier" = %s WHERE "id" = %s', ("low", source_ids["lever-de"]))

    gh_job_id = insert_raw_job(
        cur, source_ids["greenhouse-de"], originalJobId="gh-1",
        jobTitleNormalized="senior backend engineer", jobDescriptionText=_REWORDED_DESCRIPTION_A,
    )
    insert_raw_job(
        cur, source_ids["lever-de"], originalJobId="lv-1",
        sourceUrl="https://jobs.lever.co/acme/reworded",
        jobTitleNormalized="backend engineer senior", jobDescriptionText=_REWORDED_DESCRIPTION_B,
    )
    dedup.run_dedup(conn)
    near_duplicates.run_near_duplicate_clustering(conn)

    dict_cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    dict_cur.execute('SELECT * FROM "canonical_jobs" WHERE "isVisible" = true')
    visible = dict_cur.fetchall()
    assert len(visible) == 1
    assert visible[0]["rawJobId"] == gh_job_id


def test_is_idempotent_across_repeated_runs(seeded_db):
    conn, source_ids = seeded_db
    cur = conn.cursor()

    insert_raw_job(
        cur, source_ids["greenhouse-de"], originalJobId="gh-1",
        jobTitleNormalized="senior backend engineer", jobDescriptionText=_REWORDED_DESCRIPTION_A,
    )
    insert_raw_job(
        cur, source_ids["lever-de"], originalJobId="lv-1",
        sourceUrl="https://jobs.lever.co/acme/reworded",
        jobTitleNormalized="backend engineer senior", jobDescriptionText=_REWORDED_DESCRIPTION_B,
    )
    dedup.run_dedup(conn)

    first = near_duplicates.run_near_duplicate_clustering(conn)
    assert first["nearDuplicateClustersCreated"] == 1

    second = near_duplicates.run_near_duplicate_clustering(conn)
    assert second["nearDuplicateClustersCreated"] == 0
    assert second["jobsHidden"] == 0

    dict_cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    dict_cur.execute('SELECT * FROM "duplicate_clusters" WHERE "clusterKey" LIKE %s', ("near-dup:%",))
    assert len(dict_cur.fetchall()) == 1


def test_a_later_winner_does_not_reprocess_a_loser_already_hidden_by_an_earlier_winner(seeded_db):
    """Three postings in the same company+location bucket: A absorbs C as a
    near-dup, but B (sorted between them, genuinely unrelated to both) does
    not match A. When B becomes the next winner candidate, its own inner
    loop reaches C again - C must be skipped as already-hidden rather than
    re-evaluated and folded into a second, incorrect cluster crediting B
    instead of A as the winner.
    """
    conn, source_ids = seeded_db
    cur = conn.cursor()
    base_time = datetime(2026, 6, 1, tzinfo=timezone.utc)

    insert_raw_job(
        cur, source_ids["greenhouse-de"], originalJobId="gh-a",
        jobTitleNormalized="senior backend engineer", jobDescriptionText=_REWORDED_DESCRIPTION_A,
        postedAt=base_time,
    )
    insert_raw_job(
        cur, source_ids["greenhouse-de"], originalJobId="gh-b-unrelated",
        jobTitleNormalized="warehouse logistics coordinator",
        jobDescriptionText="We need someone to manage inbound shipments and pallet inventory daily.",
        postedAt=base_time + timedelta(days=1),
    )
    insert_raw_job(
        cur, source_ids["greenhouse-de"], originalJobId="gh-c",
        jobTitleNormalized="backend engineer senior", jobDescriptionText=_REWORDED_DESCRIPTION_B,
        postedAt=base_time + timedelta(days=2),
    )
    dedup.run_dedup(conn)

    result = near_duplicates.run_near_duplicate_clustering(conn)

    assert result["nearDuplicateClustersCreated"] == 1
    assert result["jobsHidden"] == 1

    dict_cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    dict_cur.execute('SELECT * FROM "canonical_jobs" WHERE "isVisible" = true')
    visible_titles = {row["jobTitleNormalized"] for row in dict_cur.fetchall()}
    assert visible_titles == {"senior backend engineer", "warehouse logistics coordinator"}
