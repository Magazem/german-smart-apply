"""Ties extractors.py + fields.py together and writes raw_jobs rows.

`build_raw_job_fields` is the pure, DB-free core used by unit tests: given a
sourceType and a raw payload dict, it returns the exact column values that
would be written to raw_jobs. `upsert_raw_job` and `run_normalizer` are the
thin DB-writing layer used by the runner/CLI and by the end-to-end test.
"""
from __future__ import annotations

import uuid
from datetime import datetime

from dateutil import parser as date_parser

from common import market_de
from normalizer import fields
from normalizer.extractors import extract_common_fields


def _parse_datetime(value) -> datetime | None:
    if not value:
        return None
    if isinstance(value, datetime):
        return value
    try:
        return date_parser.parse(str(value))
    except (ValueError, TypeError, OverflowError):
        return None


def build_raw_job_fields(
    source_type: str,
    payload: dict,
    location_dictionary: dict[str, str] | None = None,
    country_code: str = "DE",
) -> dict:
    """Pure transformation: raw payload -> normalized raw_jobs column values
    (everything except id/sourceId, which the caller/DB layer own).
    """
    location_dictionary = location_dictionary or market_de.LOCATION_DICTIONARY
    common = extract_common_fields(source_type, payload)

    company_normalized = fields.normalize_company_name(common["company_name_raw"])
    title_normalized = fields.normalize_job_title(common["job_title_raw"])
    location_normalized, resolved_country = fields.normalize_location(
        common["location_raw"], location_dictionary, country_code
    )
    salary_min, salary_max, salary_currency = fields.parse_salary(
        common["description_text"],
        market_de.SALARY_PARSING["thousandsSeparator"],
        market_de.SALARY_PARSING["decimalSeparator"],
        market_de.SALARY_PARSING["currency"],
    )
    language = fields.detect_language(common["description_text"] or common["job_title_raw"])
    seniority = fields.infer_seniority(common["job_title_raw"])
    remote_type = fields.infer_remote_type(common["location_raw"], common.get("remote_hint"))
    employment_type = fields.infer_employment_type(
        common["job_title_raw"], common["description_text"], common.get("employment_type_hint")
    )
    tech_stack_tags = fields.extract_tech_stack_tags(common["job_title_raw"], common["description_text"])

    return {
        "originalJobId": common["original_job_id"],
        "sourceUrl": common["source_url"],
        "companyNameRaw": common["company_name_raw"],
        "companyNameNormalized": company_normalized,
        "jobTitleRaw": common["job_title_raw"],
        "jobTitleNormalized": title_normalized,
        "jobDescriptionHtml": common.get("description_html"),
        "jobDescriptionText": common["description_text"],
        "language": language,
        "locationRaw": common["location_raw"],
        "locationNormalized": location_normalized,
        "countryCode": resolved_country,
        "remoteType": remote_type,
        "employmentType": employment_type,
        "seniority": seniority,
        "salaryMin": salary_min,
        "salaryMax": salary_max,
        "salaryCurrency": salary_currency,
        "techStackTags": tech_stack_tags,
        "applyUrl": common["apply_url"],
        "postedAt": _parse_datetime(common.get("posted_at")),
    }


_RAW_JOB_COLUMNS = [
    "originalJobId", "sourceUrl", "companyNameRaw", "companyNameNormalized",
    "jobTitleRaw", "jobTitleNormalized", "jobDescriptionHtml", "jobDescriptionText",
    "language", "locationRaw", "locationNormalized", "countryCode", "remoteType",
    "employmentType", "seniority", "salaryMin", "salaryMax", "salaryCurrency",
    "techStackTags", "applyUrl", "postedAt",
]


def upsert_raw_job(cur, source_id: str, row_fields: dict) -> str:
    """Insert or update a raw_jobs row keyed on (sourceId, originalJobId).

    Does not commit -- caller owns the transaction. Returns the row's id.
    """
    row_id = str(uuid.uuid4())
    columns = ['"id"', '"sourceId"'] + [f'"{c}"' for c in _RAW_JOB_COLUMNS]
    placeholders = ["%s"] * len(columns)
    update_clause = ", ".join(f'"{c}" = EXCLUDED."{c}"' for c in _RAW_JOB_COLUMNS)
    values = [row_id, source_id] + [row_fields[c] for c in _RAW_JOB_COLUMNS]

    cur.execute(
        f"""
        INSERT INTO "raw_jobs" ({", ".join(columns)})
        VALUES ({", ".join(placeholders)})
        ON CONFLICT ("sourceId", "originalJobId") DO UPDATE SET {update_clause}
        RETURNING "id"
        """,
        values,
    )
    return cur.fetchone()[0]


def run_normalizer(conn, source_row: dict, snapshots: list[dict]) -> dict:
    """Normalize a batch of raw_job_snapshots rows for one source and upsert
    them into raw_jobs. `snapshots` rows are expected to look like DB rows
    (dicts with at least "originalJobId" and "payload").
    """
    cur = conn.cursor()
    source_type = source_row["sourceType"]
    source_id = source_row["id"]
    location_dictionary = source_row.get("locationDictionary") or market_de.LOCATION_DICTIONARY

    written = 0
    for snapshot in snapshots:
        row_fields = build_raw_job_fields(source_type, snapshot["payload"], location_dictionary)
        upsert_raw_job(cur, source_id, row_fields)
        written += 1

    return {"sourceId": source_id, "rawJobsWritten": written}
