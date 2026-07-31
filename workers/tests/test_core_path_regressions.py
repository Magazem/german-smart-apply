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


# ---------------------------------------------------------------------------
# Connection loss mid-run must cost one source, not the whole invocation
# ---------------------------------------------------------------------------
# This is the failure mode observed in production: a crawl spends most of its
# wall-clock time in HTTP fetches (greenhouse alone fetched 1,541 jobs in one
# run), the single long-lived connection goes idle at the TCP level, the managed
# Postgres reaps it, and the next statement dies with "SSL connection has been
# closed unexpectedly". The run then aborted before dedup, which is why
# raw_jobs accumulated 1,552 rows still marked isDeduplicated = false.

import psycopg2

from common import db as db_module


class _DeadConnection:
    """A connection whose server has gone away: every use raises, as psycopg2
    does once the socket is gone, and rollback() raises InterfaceError."""

    closed = 0

    def cursor(self, *a, **k):
        raise psycopg2.OperationalError('SSL connection has been closed unexpectedly')

    def rollback(self):
        raise psycopg2.InterfaceError('connection already closed')

    def close(self):
        raise psycopg2.InterfaceError('connection already closed')


class _LiveConnection:
    closed = 0

    def __init__(self):
        self.rolled_back = False

    def cursor(self, *a, **k):
        class C:
            def __enter__(self_inner): return self_inner
            def __exit__(self_inner, *a): return False
            def execute(self_inner, *a, **k): return None
        return C()

    def rollback(self):
        self.rolled_back = True


def test_is_usable_is_false_for_a_connection_whose_server_went_away():
    assert db_module.is_usable(_DeadConnection()) is False


def test_is_usable_is_true_for_a_live_connection():
    assert db_module.is_usable(_LiveConnection()) is True


def test_is_usable_handles_none_and_self_closed():
    assert db_module.is_usable(None) is False
    closed = _LiveConnection()
    closed.closed = 1
    assert db_module.is_usable(closed) is False


def test_recover_connection_rolls_back_a_live_connection_and_keeps_it():
    from scripts.run_pipeline import _recover_connection

    live = _LiveConnection()
    assert _recover_connection(live) is live
    assert live.rolled_back is True


def test_recover_connection_reconnects_when_the_connection_is_dead(monkeypatch):
    """The important one: recovery must not re-raise. A bare conn.rollback() in
    the per-source handler raises InterfaceError when the connection is what
    died, which escapes the handler and aborts the run - exactly the behaviour
    the per-source isolation exists to prevent."""
    from scripts import run_pipeline

    replacement = _LiveConnection()
    monkeypatch.setattr(run_pipeline.db, 'connect', lambda *a, **k: replacement)

    recovered = run_pipeline._recover_connection(_DeadConnection())
    assert recovered is replacement


def test_connect_requests_tcp_keepalives(monkeypatch):
    """Root-cause guard: without keepalives the connection is reaped while the
    crawler is busy doing HTTP, which is what produced the outage."""
    captured = {}

    def fake_connect(dsn, **kwargs):
        captured['dsn'] = dsn
        captured['kwargs'] = kwargs
        return _LiveConnection()

    monkeypatch.setattr(db_module.psycopg2, 'connect', fake_connect)
    db_module.connect('postgresql://example/db')
    assert captured['kwargs']['keepalives'] == 1
    assert captured['kwargs']['keepalives_idle'] > 0


# ---------------------------------------------------------------------------
# Second review pass: defects found by re-reviewing the fixes above.
# ---------------------------------------------------------------------------


def test_remote_inference_does_not_invert_a_negated_statement():
    """The worst failure mode of reading the description: a posting that says
    it does NOT offer remote work being served to candidates filtering FOR it.
    That is worse than the near-empty result set the description-reading was
    added to fix - an empty list is at least honest.
    """
    assert infer_remote_type("München", None, "Kein Homeoffice, sondern Präsenzarbeit im Büro.") == "onsite"
    assert infer_remote_type("Frankfurt", None, "This role does not support remote work.") == "onsite"
    assert infer_remote_type("Berlin", None, "No remote arrangement is possible.") == "onsite"
    assert infer_remote_type("Köln", None, "Ohne Homeoffice, volle Präsenz erwartet.") == "onsite"


def test_hybrid_cloud_is_a_tech_stack_not_a_work_model():
    """`hybrid cloud` / `hybride Architektur` appear in essentially every
    Cloud/DevOps posting. Reading them as a work model moved onsite roles out
    of the onsite result set, since remoteType is a hard filter.
    """
    assert infer_remote_type("Berlin", None, "Working with hybrid cloud architecture on AWS.") == "onsite"
    assert infer_remote_type("Berlin", None, "Betrieb einer hybriden Infrastruktur.") == "onsite"
    # ...but the actual work-model sense still resolves.
    assert infer_remote_type("Berlin", None, "Hybrides Arbeiten: 3 Tage Büro, 2 Tage Homeoffice.") == "hybrid"


def test_home_office_as_a_team_name_is_not_a_work_model():
    assert infer_remote_type("München", None, "Sie unterstützen unser Home Office Equipment Team.") == "onsite"


def test_genuine_remote_signals_still_resolve():
    """Guard against the negation/boundary handling over-correcting into a
    blanket 'onsite', which would recreate the original empty-result-set bug.
    """
    assert infer_remote_type("Berlin", None, "Vollständig remote möglich.") == "remote"
    assert infer_remote_type("Berlin", None, "Homeoffice möglich an zwei Tagen pro Woche.") == "remote"
    assert infer_remote_type("Remote", None, "") == "remote"


def test_german_inflected_and_compound_titles_still_classify():
    """The word-boundary fix for "International" -> intern also rejected the
    ordinary forms German postings are actually written in. The right boundary
    is load-bearing (in "Manager International Business" the left boundary
    matches happily), so these are enumerated suffixes, not a looser boundary.
    """
    assert infer_seniority("Praktikantin Marketing") == "intern"
    assert infer_seniority("Praktikumsplatz Berlin") == "intern"
    assert infer_seniority("Traineeprogramm Bank") == "junior"
    assert infer_seniority("Berufseinsteigerin Marketing") == "junior"
    assert infer_seniority("erfahrener Entwickler") == "senior"


def test_international_still_does_not_read_as_an_internship():
    """The regression the suffix list must not undo."""
    assert infer_seniority("Manager International Business") is None
    assert infer_seniority("Internal Audit Specialist") is None


def test_an_unambiguous_country_beats_a_state_abbreviation():
    """"CA" is both California and Canada. When the string also names the
    country outright, that wins regardless of segment order.
    """
    from common import market_de

    assert normalize_location("San Francisco, CA, USA", market_de.LOCATION_DICTIONARY, "DE")[1] == "US"
    assert normalize_location("Toronto, ON, Canada", market_de.LOCATION_DICTIONARY, "DE")[1] == "CA"


def test_bare_two_letter_country_codes_still_resolve():
    """Deleting the ambiguous bare codes would be a net regression: an
    unresolved "Amsterdam, NL" falls back to the DE market default, which then
    PASSES the countryCode=DE hard filter and shows a Dutch job to a German
    candidate. Mislabeling a US posting is only an analytics error.
    """
    from common import market_de

    assert normalize_location("Amsterdam, NL", market_de.LOCATION_DICTIONARY, "DE")[1] == "NL"


class _RecordingCursor:
    """Captures execute() calls without a database. run_normalizer only needs
    a cursor it can hand to upsert_raw_job."""

    def __init__(self):
        self.executed = []

    def execute(self, sql, params=None):
        self.executed.append((sql, params))

    def fetchone(self):
        # upsert_raw_job returns cur.fetchone()[0] - the id of the row it wrote.
        return ("raw-job-id",)

    def __enter__(self):
        return self

    def __exit__(self, *exc):
        return False


class _FakeConn:
    def __init__(self, cursor):
        self._cursor = cursor

    def cursor(self, *args, **kwargs):
        return self._cursor


def test_run_normalizer_skips_a_posting_with_no_title():
    """_coerce_required_text turns a missing title into "" so the NOT NULL
    constraint cannot reject the row - which means nothing downstream stops a
    titleless posting from becoming a blank job card. Since dedup clusters on
    (company, title, location), every untitled posting from one company would
    also collapse into that single blank entry.
    """
    from normalizer.pipeline import run_normalizer

    cursor = _RecordingCursor()
    source_row = {"sourceType": "personio", "id": "src-1"}
    snapshots = [
        {"originalJobId": "1", "payload": {"id": "1", "name": None, "office": "Berlin", "descriptions": {}}},
        {"originalJobId": "2", "payload": {"id": "2", "name": "Data Engineer", "office": "Berlin", "descriptions": {}}},
    ]

    result = run_normalizer(_FakeConn(cursor), source_row, snapshots)

    assert result["rawJobsWritten"] == 1
    assert result["skippedUntitled"] == 1


def test_run_normalizer_writes_normally_when_every_posting_has_a_title():
    """The skip must not report itself when it did nothing."""
    from normalizer.pipeline import run_normalizer

    cursor = _RecordingCursor()
    source_row = {"sourceType": "personio", "id": "src-1"}
    snapshots = [
        {"originalJobId": "1", "payload": {"id": "1", "name": "Data Engineer", "office": "Berlin", "descriptions": {}}},
    ]

    result = run_normalizer(_FakeConn(cursor), source_row, snapshots)

    assert result["rawJobsWritten"] == 1
    assert "skippedUntitled" not in result


# The cases below were all found by running the new inference across the live
# corpus and reading every posting whose classification changed - not by
# imagining what German job ads might say. Each one was a real misclassification
# in a draft of this fix.


def test_inflected_remote_spellings_are_not_lost_to_the_word_boundary():
    """Matching on word boundaries is what stops "Home Office Equipment Team"
    from reading as remote - but a bare boundary also rejects the ordinary
    spellings, which files a genuinely remote job as onsite. That is the same
    hard-filter harm as the false positive, just inverted.
    """
    assert infer_remote_type("Hamburg", None, "unbegrenzte Möglichkeit für Remotework.") == "remote"
    assert infer_remote_type("Berlin", None, "the option to work 100 % remotely within Germany") == "remote"
    assert infer_remote_type("Hamburg", None, "remotes Arbeiten und flexible Arbeitszeiten") == "remote"


def test_german_compound_hybrid_is_a_work_model_but_hybridanlagen_is_not():
    """"Hybridmodus"/"Hybridarbeit" are the work arrangement. "Hybridanlagen"
    (hybrid heat-pump systems) is a product this corpus genuinely advertises,
    and must not turn a field-service job into a hybrid one.
    """
    assert infer_remote_type("Berlin", None, "wenn du aus dem Büro oder im Hybridmodus arbeitest") == "hybrid"
    assert infer_remote_type("Berlin", None, "dank hybrider Arbeitsmodelle und flexibler Arbeitszeiten") == "hybrid"
    assert infer_remote_type("Kassel", None, "Anschluss von Wärmepumpen und Hybridanlagen") == "onsite"


def test_hybrid_model_and_setup_still_describe_a_work_arrangement():
    """Excluding these as "tech nouns" hid real hybrid jobs from the hybrid
    filter. Only unambiguous infrastructure words are excluded.
    """
    assert infer_remote_type("Berlin", None, "Balance your life with our flexible hybrid model.") == "hybrid"
    assert infer_remote_type("Berlin", None, "We work in a hybrid setup, combining in-office collaboration.") == "hybrid"
    assert infer_remote_type("München", None, "work in a hybrid environment across our offices") == "hybrid"


def test_kein_problem_is_an_idiom_not_a_negation():
    """"Kein Problem" introduces an OFFER of home office. Treating its "kein"
    as a negation inverts the meaning of the sentence it appears in.
    """
    text = "Arbeitest auch mal gern von zu Hause? Kein Problem, unsere Homeoffice Option macht es möglich."
    assert infer_remote_type("Berlin", None, text) == "remote"


def test_negation_reaches_across_an_enumeration():
    """German negates a list once, at the front: "keine remote- oder
    hybridarbeit" negates BOTH terms, so the window has to clear the first one.
    """
    text = "Für die Position ist keine Remote- oder Hybridarbeit vorgesehen."
    assert infer_remote_type("Frankfurt", None, text) == "onsite"
    assert infer_remote_type("Berlin", None, "This role is not eligible for hybrid or remote work.") == "onsite"
