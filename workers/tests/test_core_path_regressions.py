"""Regression tests for the core-path defects found in the pipeline review.

Every test here failed before its corresponding fix. They are grouped in one
file, rather than scattered into the per-module suites, because they share a
theme: each one is a case where the normalizer produced a value that was
*accepted* by the DB and by the API, and then silently degraded matching. None
of them raised, so nothing caught them.

DB-free by design (`build_raw_job_fields` and the `fields` helpers are pure), so
these run without a Postgres instance - unlike most of this suite.
"""
from __future__ import annotations

import io
import re
from datetime import datetime, timedelta
from pathlib import Path

from normalizer.fields import infer_remote_type, infer_seniority, normalize_location
from normalizer.pipeline import (
    _RAW_JOB_COLUMNS,
    _parse_datetime,
    build_raw_job_fields,
    upsert_raw_job,
)


# ---------------------------------------------------------------------------
# countryCode was structurally always the market default
# ---------------------------------------------------------------------------

def test_explicit_foreign_country_segment_is_not_stamped_as_germany():
    """A non-German posting used to be stored with countryCode="DE", which let it
    pass the API's `locationCountryCode=DE` hard filter and be reported
    `eligible: true` by RankingService."""
    _, country = normalize_location("Shanghai, China", {"berlin": "Berlin"})
    assert country == "CN"


def test_foreign_city_is_normalized_to_the_city_not_the_country_name():
    city, _ = normalize_location("Shanghai, China", {"berlin": "Berlin"})
    assert city == "Shanghai"


def test_explicit_germany_segment_resolves_to_de():
    city, country = normalize_location("München, Germany", {"münchen": "Munich"})
    assert (city, country) == ("Munich", "DE")


def test_bare_german_city_not_in_the_dictionary_keeps_the_market_default():
    """Deliberate: the market pack's dictionary holds 8 cities, so a MISS is not
    evidence of a foreign posting. Treating every miss as unknown would drop most
    real German listings out of a DE-filtered search."""
    city, country = normalize_location("Nürnberg", {"berlin": "Berlin"})
    assert (city, country) == ("Nürnberg", "DE")


def test_greenhouse_payload_with_a_foreign_location_gets_the_foreign_country():
    fields = build_raw_job_fields(
        "greenhouse",
        {
            "id": 1,
            "title": "Engineer",
            "location": {"name": "Paris, France"},
            "absolute_url": "https://boards.greenhouse.io/acme/jobs/1",
            "content": "",
            "updated_at": None,
        },
    )
    assert fields["countryCode"] == "FR"


# ---------------------------------------------------------------------------
# None from an absent XML tag hit a NOT NULL column and aborted the whole run
# ---------------------------------------------------------------------------

def test_personio_position_with_absent_office_tag_does_not_produce_null_columns():
    """personio's `_position_to_dict` uses `text_of()`, which returns None both
    for a missing tag and an empty one - so the key EXISTS with value None and
    `payload.get("office", "")` never fired its default. locationRaw/jobTitleRaw
    went to the INSERT as NULL, Postgres rejected the row, and (before the
    run_pipeline fix) that aborted the invocation before dedup ever ran."""
    fields = build_raw_job_fields(
        "personio",
        {
            "id": "42",
            "name": None,
            "office": None,
            "descriptions": {},
            "_company_subdomain": "acme",
            "createdAt": None,
        },
    )
    for column in ("locationRaw", "jobTitleRaw", "companyNameRaw", "jobDescriptionText",
                   "sourceUrl", "applyUrl", "originalJobId"):
        assert fields[column] is not None, f"{column} would violate NOT NULL"
    assert fields["locationNormalized"] == "Unknown"


# ---------------------------------------------------------------------------
# postedAt in the future scored a perfect recency AND sorted first
# ---------------------------------------------------------------------------

def test_future_posted_at_is_rejected():
    """RankingService.recencyBoost returns a hard 1.0 for a negative age, and the
    candidate pool is ordered by postedAt DESC - so a future date was rewarded
    twice over. Arbeitsagentur used to fall back to `eintrittsdatum`, the
    employment START date, which is routinely months out."""
    assert _parse_datetime("2099-01-01") is None


def test_recent_past_posted_at_is_kept():
    recent = (datetime.utcnow() - timedelta(days=3)).strftime("%Y-%m-%d")
    assert _parse_datetime(recent) is not None


def test_arbeitsagentur_does_not_fall_back_to_the_employment_start_date():
    fields = build_raw_job_fields(
        "arbeitsagentur",
        {
            "refnr": "abc",
            "titel": "Pflegefachkraft",
            "arbeitgeber": "Klinik",
            "arbeitsort": {"ort": "Berlin"},
            "aktuelleVeroeffentlichungsdatum": None,
            # Months in the future - must NOT be read as a publication date.
            "eintrittsdatum": "2099-08-01",
            "stellenangebotsBeschreibung": "",
        },
    )
    assert fields["postedAt"] is None


# ---------------------------------------------------------------------------
# infer_seniority matched substrings, and seniority is a HARD filter
# ---------------------------------------------------------------------------

def test_international_is_not_classified_as_an_internship():
    """"intern" is a prefix of "International"/"Internal". Because JobsService
    applies `where.seniority = { in: [...] }` as a hard filter, these postings
    were reachable only by candidates filtering for internships."""
    assert infer_seniority("Manager International Business") != "intern"
    assert infer_seniority("Internal Audit Specialist") != "intern"


def test_real_internships_are_still_classified():
    assert infer_seniority("Praktikant Marketing") == "intern"
    assert infer_seniority("Intern, Data Science") == "intern"


def test_senior_still_classified():
    assert infer_seniority("Senior Software Engineer") == "senior"


# ---------------------------------------------------------------------------
# remoteType was near-constant "onsite", and it is a HARD filter
# ---------------------------------------------------------------------------

def test_german_home_office_wording_in_the_description_is_detected():
    """For greenhouse/lever/personio/arbeitsagentur `remote_hint` is always None,
    so remoteType could previously only come from the location STRING - which
    German postings don't use for this. They write it in the body."""
    assert infer_remote_type("Berlin", None, "Wir bieten Homeoffice und flexible Zeiten.") == "remote"


def test_german_hybrid_wording_in_the_description_is_detected():
    assert infer_remote_type("Berlin", None, "Hybrides Arbeiten in Berlin.") == "hybrid"


def test_a_plain_onsite_description_stays_onsite():
    assert infer_remote_type("Berlin", None, "Sie arbeiten in unserem Büro in Berlin.") == "onsite"


def test_description_is_optional_so_existing_callers_are_unaffected():
    assert infer_remote_type("Remote", None) == "remote"
    assert infer_remote_type("Berlin", None) == "onsite"


# ---------------------------------------------------------------------------
# Structural guards for the two raw-SQL write paths
# ---------------------------------------------------------------------------
# These are the highest-risk changes in this review and the ONLY ones that
# cannot be covered without a live Postgres: the tests that would exercise them
# (test_dedup, test_near_duplicates, test_e2e_pipeline) all require a database.
# A mistake here is not a degraded ranking input - it is a dead ingestion
# pipeline, or a silently wrong column mapping. So these assert the SQL's
# *structure* instead, which is checkable in-process.

class _CapturingCursor:
    """Records the SQL upsert_raw_job builds, without executing it."""

    def __init__(self) -> None:
        self.sql: str | None = None
        self.values: tuple | list | None = None

    def execute(self, sql, values):
        self.sql, self.values = sql, values

    def fetchone(self):
        return ("row-id",)


def _captured_upsert() -> _CapturingCursor:
    cur = _CapturingCursor()
    upsert_raw_job(cur, "source-1", {c: None for c in _RAW_JOB_COLUMNS})
    return cur


def test_upsert_placeholder_count_matches_the_values_passed():
    cur = _captured_upsert()
    placeholders = cur.sql.split("VALUES (")[1].split(")")[0].count("%s")
    assert placeholders == len(cur.values) == len(_RAW_JOB_COLUMNS) + 2  # + id + sourceId


def test_upsert_change_detection_compares_equal_numbers_of_columns():
    """The isDeduplicated reset hinges on a row-constructor comparison spanning
    every content column. Unequal arity on the two sides is a SQL error, which
    would fail EVERY job ingestion rather than degrading anything."""
    cur = _captured_upsert()
    match = re.search(r"\(\((.*?)\) IS DISTINCT FROM \((.*?)\)\)", cur.sql, re.S)
    assert match is not None, "the content-changed comparison is missing"
    left, right = match.group(1), match.group(2)
    assert left.count(",") == right.count(",") == len(_RAW_JOB_COLUMNS) - 1


def test_upsert_compares_the_existing_row_against_the_proposed_row():
    """Left side must read the OLD row (by table name), right side the incoming
    one (EXCLUDED). Getting this backwards, or comparing EXCLUDED to itself,
    would make the comparison a constant and silently stop propagating edits."""
    cur = _captured_upsert()
    match = re.search(r"\(\((.*?)\) IS DISTINCT FROM \((.*?)\)\)", cur.sql, re.S)
    assert match.group(1).strip().startswith('"raw_jobs"."')
    assert match.group(2).strip().startswith('EXCLUDED."')


def test_upsert_resets_is_deduplicated_and_refreshes_crawled_at_on_change():
    cur = _captured_upsert()
    assert '"isDeduplicated" = CASE WHEN' in cur.sql
    assert 'THEN false ELSE "raw_jobs"."isDeduplicated" END' in cur.sql
    assert '"crawledAt" = CASE WHEN' in cur.sql
    assert 'THEN now() ELSE "raw_jobs"."crawledAt" END' in cur.sql


def _canonical_fields_elements() -> list[str]:
    source = io.open(Path(__file__).parent.parent / "deduplicator" / "dedup.py", encoding="utf-8").read()
    block = source.split("canonical_fields = (", 1)[1]
    depth, i = 1, 0
    while depth > 0:
        depth += {"(": 1, ")": -1}.get(block[i], 0)
        i += 1
    return [
        line.strip().rstrip(",")
        for line in block[: i - 1].splitlines()
        if line.strip() and not line.strip().startswith("#")
    ]


def test_canonical_fields_arity_matches_both_dedup_statements():
    """canonical_fields is splatted positionally into two hand-written
    statements, so an inserted or removed element shifts every value after it
    onto the wrong column - with no error if the types happen to line up.
    Both statements take 19 placeholders: the UPDATE as 1 + N + 1 (rawJobId,
    fields, WHERE id) and the INSERT as 2 + N (id, rawJobId, fields)."""
    assert len(_canonical_fields_elements()) == 17


def test_posted_at_falls_back_to_crawled_at_in_the_persisted_canonical_row():
    """The fallback has to be PERSISTED, not just used for dedup's internal sort
    key - a NULL postedAt sorts ahead of every dated row in the candidate pool
    and scores a flat 0.4 recency."""
    elements = _canonical_fields_elements()
    posted_at = [e for e in elements if e.startswith('canonical_pick["postedAt"]')]
    assert posted_at == ['canonical_pick["postedAt"] or canonical_pick["crawledAt"]']
