"""Tests for normalizer.pipeline.build_raw_job_fields: the pure, DB-free
transformation from a raw source payload straight to raw_jobs column values.
One test per source type, using the same fixtures the crawler adapter tests use.
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone

import pytest

from normalizer.extractors import extract_common_fields
from normalizer.pipeline import _parse_datetime, build_raw_job_fields
from tests.conftest import load_fixture


def test_parse_datetime_uses_dayfirst_for_german_ambiguous_dates():
    # market_de.COUNTRY_CODE == "DE" uses DD.MM.YYYY; "01.07.2026" must parse
    # as 1 July, not (dayfirst=False's default) 7 January.
    parsed = _parse_datetime("01.07.2026")
    assert parsed.month == 7
    assert parsed.day == 1


def test_parse_datetime_unambiguous_iso_formats_unaffected_by_dayfirst():
    parsed = _parse_datetime("2026-07-01T00:00:00Z")
    assert (parsed.year, parsed.month, parsed.day) == (2026, 7, 1)


def test_parse_datetime_always_returns_naive_utc_regardless_of_source_offset():
    # postedAt is a Postgres TIMESTAMP(3) (no time zone) column - mixing naive
    # (date-only sources like Arbeitsagentur) and aware (Greenhouse's "Z",
    # Lever's constructed offsets) datetimes into it means psycopg2 silently
    # converts aware values to the session time zone while storing naive ones
    # as-is, skewing postedAt inconsistently by source. Every parsed value
    # must come out naive and UTC-normalized so they're comparable.
    naive_date_only = _parse_datetime("2026-07-01")
    assert naive_date_only.tzinfo is None

    utc_marker = _parse_datetime("2026-07-01T10:00:00Z")
    assert utc_marker.tzinfo is None
    assert (utc_marker.hour, utc_marker.minute) == (10, 0)

    # A non-UTC offset must be converted to its UTC wall-clock time, not
    # just have its tzinfo stripped in place.
    plus_two_offset = _parse_datetime("2026-07-01T10:00:00+02:00")
    assert plus_two_offset.tzinfo is None
    assert (plus_two_offset.hour, plus_two_offset.minute) == (8, 0)


def test_parse_datetime_missing_value_returns_none():
    # A source that simply doesn't provide a posting date (common.get(
    # "posted_at") comes back None/empty) must not error -- postedAt just
    # stays nullable in raw_jobs.
    assert _parse_datetime(None) is None
    assert _parse_datetime("") is None


def test_parse_datetime_accepts_an_already_parsed_datetime_object():
    aware = datetime(2026, 7, 1, 10, 0, tzinfo=timezone(timedelta(hours=2)))
    result = _parse_datetime(aware)
    assert result.tzinfo is None
    assert (result.hour, result.minute) == (8, 0)  # converted to UTC wall-clock, not just stripped


def test_parse_datetime_malformed_string_returns_none_instead_of_raising():
    # A flaky/malformed source value shouldn't crash the normalizer run --
    # postedAt just comes back None, same as a missing value.
    assert _parse_datetime("not a real date, sorry") is None


def test_build_raw_job_fields_greenhouse():
    payload = load_fixture("greenhouse_jobs.json")["jobs"][0]
    result = build_raw_job_fields("greenhouse", payload)

    assert result["originalJobId"] == "1001"
    assert result["companyNameRaw"] == "Acme GmbH"
    assert result["companyNameNormalized"] == "acme"
    assert result["jobTitleRaw"] == "Senior Backend Engineer (m/w/d)"
    assert result["jobTitleNormalized"] == "senior backend engineer"
    assert result["locationNormalized"] == "Berlin"
    assert result["countryCode"] == "DE"
    assert result["seniority"] == "senior"
    assert result["remoteType"] == "onsite"
    assert result["employmentType"] == "full_time"
    assert result["salaryMin"] == 65000
    assert result["salaryMax"] == 80000
    assert result["salaryCurrency"] == "EUR"
    assert "python" in result["techStackTags"]
    assert "aws" in result["techStackTags"]
    assert result["applyUrl"] == "https://boards.greenhouse.io/acme/jobs/1001"


def test_build_raw_job_fields_greenhouse_werkstudent():
    payload = load_fixture("greenhouse_jobs.json")["jobs"][1]
    result = build_raw_job_fields("greenhouse", payload)

    assert result["locationNormalized"] == "Remote"
    assert result["remoteType"] == "remote"
    assert result["employmentType"] == "working_student"
    assert result["language"] == "de"


def test_build_raw_job_fields_lever():
    payload = load_fixture("lever_postings.json")[0]
    result = build_raw_job_fields("lever", payload)

    assert result["originalJobId"] == "abc-123"
    assert result["jobTitleNormalized"] == "senior backend engineer"
    assert result["locationNormalized"] == "Berlin"
    assert result["employmentType"] == "full_time"
    assert result["salaryMin"] == 65000
    assert result["salaryMax"] == 80000
    assert result["postedAt"] is not None


def test_build_raw_job_fields_arbeitsagentur():
    payload = load_fixture("arbeitsagentur_jobs.json")["stellenangebote"][0]
    result = build_raw_job_fields("arbeitsagentur", payload)

    assert result["originalJobId"] == "10000-1234567890-S"
    assert result["companyNameRaw"] == "Deutsche Telekom AG"
    assert result["companyNameNormalized"] == "deutsche telekom"
    assert result["jobTitleNormalized"] == "lead devops engineer"
    assert result["seniority"] == "lead"
    assert result["locationNormalized"] == "Bonn"  # not in market-de's location dict -> title-cased fallback
    assert result["language"] == "de"
    assert "kubernetes" in result["techStackTags"]
    # Real field name is stellenangebotsBeschreibung (confirmed against the
    # live detail endpoint) - not stellenbeschreibung, which doesn't exist in
    # a real response and was silently reading as empty before this was caught.
    assert result["jobDescriptionText"] == (
        "Wir suchen einen erfahrenen DevOps Lead mit Kubernetes und Terraform Kenntnissen."
    )
    # "Apply on Arbeitsagentur" (applyUrl) must open the BA detail page;
    # "View original listing" (sourceUrl) must open the employer's own posting.
    assert result["applyUrl"] == "https://www.arbeitsagentur.de/jobsuche/jobdetail/10000-1234567890-S"
    assert result["sourceUrl"] == "https://telekom.example/karriere/12345"


def test_build_raw_job_fields_stepstone():
    payload = load_fixture("stepstone_feed.json")["jobs"][0]
    result = build_raw_job_fields("stepstone", payload)

    assert result["originalJobId"] == "ss-501"
    assert result["companyNameNormalized"] == "beispiel data"
    assert result["jobTitleNormalized"] == "junior data analyst"
    assert result["seniority"] == "junior"
    assert result["locationNormalized"] == "Hamburg"
    assert "sql" in result["techStackTags"]
    assert "python" in result["techStackTags"]


def test_build_raw_job_fields_scam_listing_shape_still_normalizes():
    """Normalization must succeed even on a scam-shaped listing -- scoring the
    scam risk is the deduplicator's job, not the normalizer's, but the
    normalizer must not choke on it.
    """
    payload = load_fixture("scam_listing.json")
    result = build_raw_job_fields("greenhouse", payload)

    assert result["originalJobId"] == "9999"
    assert result["companyNameNormalized"] == "quick cash ventures"
    assert result["applyUrl"] == "https://totally-legit-jobs.tk/apply/9999"


def test_extract_common_fields_raises_for_an_unregistered_source_type():
    # Mirrors crawler.runner.fetch_source's own unregistered-adapter guard --
    # a config/data error should surface as a clear, immediate ValueError,
    # not a confusing KeyError from whichever extractor happened to run.
    with pytest.raises(ValueError, match="unknown-board"):
        extract_common_fields("unknown-board", {})
