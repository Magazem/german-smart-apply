"""Shared test-only helpers for building raw_jobs rows across dedup and
near-duplicate test modules. Not itself collected by pytest (no test_
prefix).
"""
from __future__ import annotations

import uuid


def insert_raw_job(cur, source_id: str, **overrides) -> str:
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
