"""Tests for the Deduplication and Trust Layer.

Trust scoring and scam-risk heuristics are pure-function unit tests. Company
alias resolution and the exact-dedup engine itself need real Postgres (via
the pg_conn/seeded_db fixtures) since they read/write company_aliases and
raw_jobs/canonical_jobs/duplicate_clusters/duplicate_cluster_members.
"""
from __future__ import annotations

import uuid

import psycopg2.extras

from deduplicator import dedup, trust
from deduplicator.seed import seed_company_aliases
from normalizer.fields import normalize_company_name


# ---------------------------------------------------------------------------
# Trust score mapping
# ---------------------------------------------------------------------------

def test_trust_score_for_known_tiers():
    assert trust.trust_score_for_tier("high") == 0.9
    assert trust.trust_score_for_tier("medium") == 0.6
    assert trust.trust_score_for_tier("low") == 0.3


def test_trust_score_for_unknown_tier_defaults_to_medium_ish():
    assert trust.trust_score_for_tier("something-else") == 0.5


# ---------------------------------------------------------------------------
# Scam-risk heuristics
# ---------------------------------------------------------------------------

def test_scam_risk_score_clean_listing_is_zero():
    score = trust.compute_scam_risk_score(
        "We are looking for a Senior Backend Engineer with Python experience.",
        apply_url="https://boards.greenhouse.io/acme/jobs/1001",
        source_url="https://boards.greenhouse.io/acme/jobs/1001",
    )
    assert score == 0.0


def test_scam_risk_score_suspicious_domain_is_flagged():
    score = trust.compute_scam_risk_score(
        "A perfectly normal-sounding job description.",
        apply_url="https://totally-legit-jobs.tk/apply/9999",
    )
    assert score >= trust.DOMAIN_MATCH_WEIGHT


def test_scam_risk_score_suspicious_contact_phrases_are_flagged():
    score = trust.compute_scam_risk_score(
        "No interview required! Just send your IBAN and bank details via WhatsApp only. Wire transfer needed.",
        apply_url="https://jobs.example.com/1",
    )
    assert score >= trust.CONTACT_MATCH_WEIGHT * 2


def test_scam_risk_score_capped_at_one():
    score = trust.compute_scam_risk_score(
        "No interview required! Send IBAN and bank details. WhatsApp only. Wire transfer. Pay a deposit.",
        apply_url="https://totally-legit-jobs.tk/apply/9999",
    )
    assert score == 1.0


def test_scam_risk_score_does_not_false_positive_on_path_containing_tk_substring():
    # ".tk$" must match the *hostname*, not any substring of the full URL path.
    score = trust.compute_scam_risk_score(
        "A normal job.",
        apply_url="https://jobs.example.com/roles/network-stack/1",
    )
    assert score == 0.0


def test_scam_risk_score_flags_mailto_contact_with_suspicious_domain():
    # mailto: is non-hierarchical (urlparse(...).hostname is always None for
    # it) -- the domain half of the email address must still be checked
    # against suspiciousDomainPatterns like gmail.com$.
    score = trust.compute_scam_risk_score(
        "A perfectly normal-sounding job description.",
        apply_url="mailto:someone@gmail.com",
        source_url="https://boards.greenhouse.io/acme/jobs/1001",
    )
    assert score >= trust.DOMAIN_MATCH_WEIGHT


def test_scam_risk_score_mailto_to_a_non_suspicious_domain_is_not_flagged():
    score = trust.compute_scam_risk_score(
        "A perfectly normal-sounding job description.",
        apply_url="mailto:hr@acme-corp.com",
    )
    assert score == 0.0


# ---------------------------------------------------------------------------
# Company alias resolution (needs Postgres: company_aliases table)
# ---------------------------------------------------------------------------

def test_seed_company_aliases_inserts_only_genuinely_different_normalized_variants(pg_conn):
    inserted = seed_company_aliases(pg_conn)
    # "SAP"/"SAP AG" normalize to the same key as canonical "SAP SE" ("sap") and
    # are skipped as self-mapping no-ops; only "SAP Deutschland" differs (1).
    # Zalando's aliases all collapse to "zalando" too (0).
    # Deutsche Telekom contributes "t-systems" and "telekom" (2).
    # ERGO contributes "ergo group" (1).
    # Ferchau's bare "GmbH" form is a no-op; its three branch-office variants
    # each differ from canonical "ferchau" (3).
    # Siemens/Bosch/Allianz/Continental each contribute exactly one genuine
    # variant beyond their self-mapping bare form (4).
    assert inserted == 1 + 0 + 2 + 1 + 3 + 4


def test_resolve_company_key_via_alias(seeded_db):
    conn, _ = seeded_db
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)

    assert dedup.resolve_company_key(cur, normalize_company_name("SAP Deutschland")) == "sap"
    assert dedup.resolve_company_key(cur, normalize_company_name("T-Systems")) == "deutsche telekom"
    assert dedup.resolve_company_key(cur, normalize_company_name("Telekom")) == "deutsche telekom"
    assert dedup.resolve_company_key(cur, normalize_company_name("ERGO Group")) == "ergo"
    assert (
        dedup.resolve_company_key(cur, normalize_company_name("Ferchau GmbH Niederlassung Lübeck"))
        == "ferchau"
    )
    assert (
        dedup.resolve_company_key(cur, normalize_company_name("Ferchau GmbH Niederlassung Rosenheim"))
        == "ferchau"
    )
    assert dedup.resolve_company_key(cur, normalize_company_name("Bosch")) == "robert bosch"
    assert dedup.resolve_company_key(cur, normalize_company_name("Conti")) == "continental"


def test_resolve_company_key_passthrough_for_unknown_company(seeded_db):
    conn, _ = seeded_db
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)

    unknown = normalize_company_name("Some Random Startup GmbH")
    assert dedup.resolve_company_key(cur, unknown) == unknown


# ---------------------------------------------------------------------------
# Cluster key determinism
# ---------------------------------------------------------------------------

def test_compute_cluster_key_is_deterministic_and_order_sensitive():
    key1 = dedup.compute_cluster_key("acme", "senior backend engineer", "berlin")
    key2 = dedup.compute_cluster_key("acme", "senior backend engineer", "berlin")
    key3 = dedup.compute_cluster_key("acme", "junior backend engineer", "berlin")
    assert key1 == key2
    assert key1 != key3


# ---------------------------------------------------------------------------
# run_dedup: exact-duplicate collapse vs. near-miss (must NOT collapse)
# ---------------------------------------------------------------------------

def _insert_raw_job(cur, source_id: str, **overrides) -> str:
    row_id = str(uuid.uuid4())
    defaults = {
        "originalJobId": str(uuid.uuid4()),
        "sourceUrl": "https://example.com/job",
        "companyNameRaw": "Acme GmbH",
        "companyNameNormalized": "acme",
        "jobTitleRaw": "Senior Backend Engineer",
        "jobTitleNormalized": "senior backend engineer",
        "jobDescriptionHtml": None,
        "jobDescriptionText": "We are looking for a Senior Backend Engineer.",
        "language": "en",
        "locationRaw": "Berlin",
        "locationNormalized": "Berlin",
        "countryCode": "DE",
        "remoteType": "onsite",
        "employmentType": "full_time",
        "seniority": "senior",
        "salaryMin": None,
        "salaryMax": None,
        "salaryCurrency": None,
        "techStackTags": [],
        "applyUrl": "https://example.com/job",
        "postedAt": None,
    }
    defaults.update(overrides)
    cur.execute(
        """
        INSERT INTO "raw_jobs" (
            "id", "sourceId", "originalJobId", "sourceUrl", "companyNameRaw", "companyNameNormalized",
            "jobTitleRaw", "jobTitleNormalized", "jobDescriptionHtml", "jobDescriptionText", "language",
            "locationRaw", "locationNormalized", "countryCode", "remoteType", "employmentType", "seniority",
            "salaryMin", "salaryMax", "salaryCurrency", "techStackTags", "applyUrl", "postedAt"
        ) VALUES (
            %(id)s, %(sourceId)s, %(originalJobId)s, %(sourceUrl)s, %(companyNameRaw)s, %(companyNameNormalized)s,
            %(jobTitleRaw)s, %(jobTitleNormalized)s, %(jobDescriptionHtml)s, %(jobDescriptionText)s, %(language)s,
            %(locationRaw)s, %(locationNormalized)s, %(countryCode)s, %(remoteType)s, %(employmentType)s, %(seniority)s,
            %(salaryMin)s, %(salaryMax)s, %(salaryCurrency)s, %(techStackTags)s, %(applyUrl)s, %(postedAt)s
        )
        """,
        {"id": row_id, "sourceId": source_id, **defaults},
    )
    return row_id


def test_run_dedup_collapses_exact_duplicates_across_sources(seeded_db):
    conn, source_ids = seeded_db
    cur = conn.cursor()

    gh_job_id = _insert_raw_job(cur, source_ids["greenhouse-de"], originalJobId="gh-1")
    lever_job_id = _insert_raw_job(
        cur, source_ids["lever-de"], originalJobId="lv-1", sourceUrl="https://jobs.lever.co/acme/abc-123"
    )

    result = dedup.run_dedup(conn)

    assert result["rawJobsProcessed"] == 2
    assert result["groups"] == 1
    assert result["canonicalJobsCreated"] == 1
    assert result["duplicateClustersCreated"] == 1
    assert result["duplicateClusterMembersCreated"] == 2

    dict_cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    dict_cur.execute('SELECT * FROM "canonical_jobs"')
    canonical_rows = dict_cur.fetchall()
    assert len(canonical_rows) == 1

    dict_cur.execute('SELECT * FROM "duplicate_clusters" WHERE "canonicalJobId" = %s', (canonical_rows[0]["id"],))
    clusters = dict_cur.fetchall()
    assert len(clusters) == 1

    dict_cur.execute(
        'SELECT * FROM "duplicate_cluster_members" WHERE "duplicateClusterId" = %s', (clusters[0]["id"],)
    )
    members = dict_cur.fetchall()
    assert {m["rawJobId"] for m in members} == {gh_job_id, lever_job_id}
    assert sum(1 for m in members if m["isCanonicalPick"]) == 1

    cur.execute('SELECT "isDeduplicated" FROM "raw_jobs" WHERE "id" IN (%s, %s)', (gh_job_id, lever_job_id))
    assert all(row[0] for row in cur.fetchall())


def test_run_dedup_does_not_collapse_near_miss_different_location(seeded_db):
    conn, source_ids = seeded_db
    cur = conn.cursor()

    _insert_raw_job(cur, source_ids["greenhouse-de"], originalJobId="gh-berlin", locationNormalized="Berlin")
    _insert_raw_job(cur, source_ids["greenhouse-de"], originalJobId="gh-munich", locationNormalized="Munich")

    result = dedup.run_dedup(conn)

    assert result["rawJobsProcessed"] == 2
    assert result["groups"] == 2
    assert result["canonicalJobsCreated"] == 2
    # Every cluster key gets a duplicate_clusters row from its first sighting
    # (even a "cluster of one"), so a later cross-run duplicate can be found
    # and folded in - see test_run_dedup_collapses_cross_run_duplicates.
    assert result["duplicateClustersCreated"] == 2
    assert result["duplicateClusterMembersCreated"] == 2

    dict_cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    dict_cur.execute('SELECT * FROM "canonical_jobs"')
    assert len(dict_cur.fetchall()) == 2


def test_run_dedup_collapses_aliased_company_spelling_at_the_same_location(seeded_db):
    """End-to-end: two sources spell the same real employer differently
    (canonical "ergo" vs. the observed "ERGO Group" variant) but post the
    identical role in the identical city - resolve_company_key must unify
    them into one canonical_jobs row, same as an already-identical spelling
    would.
    """
    conn, source_ids = seeded_db
    cur = conn.cursor()

    _insert_raw_job(
        cur, source_ids["greenhouse-de"], originalJobId="ergo-1",
        companyNameRaw="ERGO", companyNameNormalized="ergo",
    )
    _insert_raw_job(
        cur, source_ids["lever-de"], originalJobId="ergo-2",
        sourceUrl="https://jobs.lever.co/ergo/xyz-1",
        companyNameRaw="ERGO Group", companyNameNormalized="ergo group",
    )

    result = dedup.run_dedup(conn)

    assert result["groups"] == 1
    assert result["canonicalJobsCreated"] == 1

    dict_cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    dict_cur.execute('SELECT * FROM "canonical_jobs"')
    assert len(dict_cur.fetchall()) == 1


def test_run_dedup_does_not_collapse_aliased_branch_offices_in_different_cities(seeded_db):
    """The asymmetric-risk case: Ferchau's Lübeck and Rosenheim branches both
    alias to the canonical "ferchau" key, but they are genuinely different
    job openings in different cities - a wrong company-identity merge must
    not also merge the postings themselves. compute_cluster_key includes
    location, so these must remain two separate canonical_jobs rows.
    """
    conn, source_ids = seeded_db
    cur = conn.cursor()

    _insert_raw_job(
        cur, source_ids["greenhouse-de"], originalJobId="ferchau-luebeck",
        companyNameRaw="Ferchau GmbH Niederlassung Lübeck",
        companyNameNormalized="ferchau gmbh niederlassung lübeck",
        locationNormalized="Lübeck",
    )
    _insert_raw_job(
        cur, source_ids["greenhouse-de"], originalJobId="ferchau-rosenheim",
        companyNameRaw="Ferchau GmbH Niederlassung Rosenheim",
        companyNameNormalized="ferchau gmbh niederlassung rosenheim",
        locationNormalized="Rosenheim",
    )

    result = dedup.run_dedup(conn)

    assert result["groups"] == 2
    assert result["canonicalJobsCreated"] == 2

    dict_cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    dict_cur.execute('SELECT * FROM "canonical_jobs"')
    canonical_rows = dict_cur.fetchall()
    assert len(canonical_rows) == 2
    assert {r["locationNormalized"] for r in canonical_rows} == {"Lübeck", "Rosenheim"}


def test_run_dedup_does_not_collapse_near_miss_different_title(seeded_db):
    conn, source_ids = seeded_db
    cur = conn.cursor()

    _insert_raw_job(
        cur, source_ids["greenhouse-de"], originalJobId="gh-backend",
        jobTitleNormalized="senior backend engineer",
    )
    _insert_raw_job(
        cur, source_ids["greenhouse-de"], originalJobId="gh-frontend",
        jobTitleNormalized="senior frontend engineer",
    )

    result = dedup.run_dedup(conn)

    assert result["groups"] == 2
    assert result["canonicalJobsCreated"] == 2
    assert result["duplicateClustersCreated"] == 2


def test_run_dedup_picks_higher_trust_source_as_canonical(seeded_db):
    conn, source_ids = seeded_db
    cur = conn.cursor()

    # both greenhouse-de and lever-de are "high" trust in market-de, so make
    # this deterministic by downgrading lever-de's trust tier for this test.
    cur.execute('UPDATE "sources" SET "trustTier" = %s WHERE "id" = %s', ("low", source_ids["lever-de"]))

    gh_job_id = _insert_raw_job(cur, source_ids["greenhouse-de"], originalJobId="gh-1")
    _insert_raw_job(cur, source_ids["lever-de"], originalJobId="lv-1")

    dedup.run_dedup(conn)

    dict_cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    dict_cur.execute('SELECT * FROM "canonical_jobs"')
    canonical = dict_cur.fetchone()
    assert canonical["rawJobId"] == gh_job_id
    assert canonical["sourceTrustScore"] == 0.9  # high tier


def test_run_dedup_collapses_cross_run_duplicates(seeded_db):
    """The core bug: sources crawl on independent schedules, so an exact
    duplicate from a second source routinely arrives in a *separate*
    run_dedup() call, not the same one. It must still collapse into the
    original canonical_jobs row, not create a second one.
    """
    conn, source_ids = seeded_db
    cur = conn.cursor()

    gh_job_id = _insert_raw_job(cur, source_ids["greenhouse-de"], originalJobId="gh-1")
    first_result = dedup.run_dedup(conn)
    assert first_result["canonicalJobsCreated"] == 1
    assert first_result["duplicateClustersCreated"] == 1

    dict_cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    dict_cur.execute('SELECT * FROM "canonical_jobs"')
    canonical_after_first_run = dict_cur.fetchall()
    assert len(canonical_after_first_run) == 1
    first_canonical_id = canonical_after_first_run[0]["id"]

    # A second source posts an exact duplicate, discovered in a *later* run.
    lever_job_id = _insert_raw_job(
        cur, source_ids["lever-de"], originalJobId="lv-1", sourceUrl="https://jobs.lever.co/acme/abc-123"
    )
    second_result = dedup.run_dedup(conn)

    # No new canonical_jobs row or cluster - it folds into the existing one.
    assert second_result["canonicalJobsCreated"] == 0
    assert second_result["duplicateClustersCreated"] == 0
    assert second_result["duplicateClusterMembersCreated"] == 1

    dict_cur.execute('SELECT * FROM "canonical_jobs"')
    canonical_after_second_run = dict_cur.fetchall()
    assert len(canonical_after_second_run) == 1
    assert canonical_after_second_run[0]["id"] == first_canonical_id

    dict_cur.execute(
        'SELECT * FROM "duplicate_clusters" WHERE "canonicalJobId" = %s', (first_canonical_id,)
    )
    clusters = dict_cur.fetchall()
    assert len(clusters) == 1

    dict_cur.execute(
        'SELECT * FROM "duplicate_cluster_members" WHERE "duplicateClusterId" = %s', (clusters[0]["id"],)
    )
    members = dict_cur.fetchall()
    assert {m["rawJobId"] for m in members} == {gh_job_id, lever_job_id}


def test_run_dedup_promotes_higher_trust_job_arriving_in_a_later_run(seeded_db):
    """A cross-run duplicate that's *more* trustworthy than the original
    canonical pick must be promoted - the canonical_jobs row itself should
    switch to point at it, not just add it as a non-canonical member.
    """
    conn, source_ids = seeded_db
    cur = conn.cursor()

    cur.execute('UPDATE "sources" SET "trustTier" = %s WHERE "id" = %s', ("low", source_ids["lever-de"]))

    lever_job_id = _insert_raw_job(cur, source_ids["lever-de"], originalJobId="lv-first")
    dedup.run_dedup(conn)

    dict_cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    dict_cur.execute('SELECT * FROM "canonical_jobs"')
    initial_canonical = dict_cur.fetchone()
    assert initial_canonical["rawJobId"] == lever_job_id

    # A higher-trust source posts the same role, discovered in a later run.
    gh_job_id = _insert_raw_job(cur, source_ids["greenhouse-de"], originalJobId="gh-later")
    dedup.run_dedup(conn)

    dict_cur.execute('SELECT * FROM "canonical_jobs"')
    rows = dict_cur.fetchall()
    assert len(rows) == 1
    assert rows[0]["id"] == initial_canonical["id"]  # same canonical row, not a new one
    assert rows[0]["rawJobId"] == gh_job_id  # promoted to the higher-trust job
    assert rows[0]["sourceTrustScore"] == 0.9

    dict_cur.execute(
        'SELECT * FROM "duplicate_cluster_members" WHERE "duplicateClusterId" = ('
        '  SELECT "id" FROM "duplicate_clusters" WHERE "canonicalJobId" = %s'
        ')',
        (initial_canonical["id"],),
    )
    members = {m["rawJobId"]: m["isCanonicalPick"] for m in dict_cur.fetchall()}
    assert members == {lever_job_id: False, gh_job_id: True}
