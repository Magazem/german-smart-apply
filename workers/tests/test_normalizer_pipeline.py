"""Tests for normalizer.pipeline.build_raw_job_fields: the pure, DB-free
transformation from a raw source payload straight to raw_jobs column values.
One test per source type, using the same fixtures the crawler adapter tests use.
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone

import pytest

from normalizer.extractors import _strip_html, extract_common_fields, extract_personio
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


# ---------------------------------------------------------------------------
# _strip_html -- builds jobDescriptionText (the plain-text fallback, distinct
# from jobDescriptionHtml which stores the untouched original) for greenhouse/
# personio/smartrecruiters. Regression coverage for two real bugs: (1) every
# tag boundary used to collapse to a single space, destroying all paragraph/
# list/heading structure before the frontend's pre-wrap CSS ever saw it, and
# (2) HTML entities were never decoded, so escaped source text (e.g.
# "&lt;/h2&gt;") passed straight through and rendered as literal escaped
# characters on the page.
# ---------------------------------------------------------------------------

def test_strip_html_multi_paragraph_input_produces_newline_separated_output():
    # Old behavior: re.sub(r"<[^>]+>", " ", ...) then re.sub(r"\s+", " ", ...)
    # collapsed this to the single run-on string "First paragraph. Second
    # paragraph." with no separator at all -- "First." in result and
    # "Second." in result would both be true even under that bug, so the
    # assertion has to pin the actual separator, not just substring presence.
    html_input = "<p>First paragraph.</p><p>Second paragraph.</p>"
    result = _strip_html(html_input)

    assert result == "First paragraph.\n\nSecond paragraph."
    assert "\n" in result  # would fail under the old single-space collapse


def test_strip_html_list_and_headings_produce_newline_breaks():
    html_input = "<h2>Responsibilities</h2><ul><li>Own the roadmap</li><li>Ship features</li></ul>"
    result = _strip_html(html_input)

    assert "Responsibilities\n" in result
    assert "Own the roadmap\n" in result
    assert "Ship features" in result
    # No tag boundary should have merged directly into the next word with no
    # separator (the old bug's "single space glue" symptom).
    assert "RoadmapShip" not in result.replace("\n", "")


def test_strip_html_decodes_already_escaped_html_entities():
    # Old behavior did no entity decoding at all, so "&amp;" (and any other
    # escaped sequence) passed straight through untouched. Asserting only
    # that "team" is present would pass under the bug too -- the assertion
    # must pin the decoded character showing up and the raw escape sequence
    # being gone.
    html_input = "<p>Join our R&amp;D team.</p>"
    result = _strip_html(html_input)

    assert result == "Join our R&D team."
    assert "&amp;" not in result


def test_strip_html_decodes_an_escaped_closing_tag_look_alike():
    # Mirrors the exact user-reported symptom: a source payload containing
    # already-escaped entity text for what looks like a tag (e.g. copied from
    # a code sample in the job ad) must decode to the real characters, not
    # survive as the literal escape sequence "&lt;/h2&gt;" on the page.
    html_input = "<p>Example: &lt;/h2&gt; closes a heading.</p>"
    result = _strip_html(html_input)

    assert result == "Example: </h2> closes a heading."
    assert "&lt;" not in result and "&gt;" not in result


def test_strip_html_collapses_only_horizontal_whitespace_not_newlines():
    html_input = "<p>Line   with    extra   spaces.</p>"
    result = _strip_html(html_input)

    assert result == "Line with extra spaces."


def test_strip_html_caps_excessive_blank_lines_at_one():
    html_input = "<p>First.</p><br><br><br><br><p>Second.</p>"
    result = _strip_html(html_input)

    assert "\n\n\n" not in result
    assert result == "First.\n\nSecond."


def test_strip_html_empty_and_none_input_returns_empty_string():
    assert _strip_html("") == ""
    assert _strip_html(None) == ""


def test_extract_personio_description_text_preserves_section_heading_breaks():
    # extract_personio builds description_html itself as "<h3>{name}</h3>
    # {value}" per section, then runs it through _strip_html -- this is an
    # end-to-end check that the heading/paragraph structure of that
    # construction actually survives into jobDescriptionText.
    payload = {
        "id": 4001,
        "name": "Backend Engineer",
        "office": "Berlin",
        "_company_subdomain": "acme",
        "descriptions": {
            "Your Role": "<p>Own core services.</p>",
            "Your Profile": "<p>Strong Python background.</p>",
        },
    }
    result = extract_personio(payload)

    assert "Your Role" in result["description_text"]
    assert "Your Profile" in result["description_text"]
    assert "\n" in result["description_text"]
    assert "RoleOwn" not in result["description_text"]
