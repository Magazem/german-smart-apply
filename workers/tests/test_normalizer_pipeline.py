"""Tests for normalizer.pipeline.build_raw_job_fields: the pure, DB-free
transformation from a raw source payload straight to raw_jobs column values.
One test per source type, using the same fixtures the crawler adapter tests use.
"""
from __future__ import annotations

from normalizer.pipeline import build_raw_job_fields
from tests.conftest import load_fixture


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
