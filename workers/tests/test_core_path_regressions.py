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

from datetime import datetime, timedelta

from normalizer.fields import infer_remote_type, infer_seniority, normalize_location
from normalizer.pipeline import _parse_datetime, build_raw_job_fields


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
