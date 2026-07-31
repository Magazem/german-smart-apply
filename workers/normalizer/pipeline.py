"""Ties extractors.py + fields.py together and writes raw_jobs rows.

`build_raw_job_fields` is the pure, DB-free core used by unit tests: given a
sourceType and a raw payload dict, it returns the exact column values that
would be written to raw_jobs. `upsert_raw_job` and `run_normalizer` are the
thin DB-writing layer used by the runner/CLI and by the end-to-end test.
"""
from __future__ import annotations

import re
import uuid
from datetime import datetime, timedelta, timezone

from dateutil import parser as date_parser

from common import market_de
from normalizer import fields
from normalizer.extractors import extract_common_fields

# Matches German-convention DD.MM.YYYY (dot-separated) date strings, the one
# genuinely ambiguous format this pipeline needs to special-case.
_DOTTED_DATE_RE = re.compile(r"^\s*\d{1,2}\.\d{1,2}\.\d{2,4}")


def _to_utc_naive(value: datetime) -> datetime:
    """Postgres's TIMESTAMP(3) column (raw_jobs.postedAt) has no time zone,
    so a tz-aware value gets silently converted to the DB session's time
    zone before storage while a naive value is stored as-is. Some sources
    give date-only strings (naive) and others give "...Z"/offset timestamps
    (aware) - without normalizing both to the same UTC-wall-clock
    representation first, postedAt shifted inconsistently by source
    whenever the session time zone wasn't UTC, skewing the ranking
    recency component. Naive values are assumed already UTC (the only
    naive sources are date-only, so there's no offset to convert).
    """
    if value.tzinfo is None:
        return value
    return value.astimezone(timezone.utc).replace(tzinfo=None)


def _reject_future(value: datetime | None) -> datetime | None:
    """Drop a postedAt that claims to be in the future.

    A publication date later than now is not a fresh posting, it is bad data -
    and both recency consumers reward it maximally rather than distrusting it:
    RankingService.recencyBoost returns a hard 1.0 for a negative age, and the
    candidate pool is ordered by postedAt DESC, so future-dated rows sort above
    every real posting. Returning None routes them through the same
    crawledAt fallback as any other undated job.

    A small tolerance absorbs clock skew between the source and this machine
    without letting a genuinely wrong date (days or months out) through.
    """
    if value is None:
        return None
    if value > datetime.utcnow() + timedelta(days=1):
        return None
    return value


def _parse_datetime(value) -> datetime | None:
    if not value:
        return None
    if isinstance(value, datetime):
        return _reject_future(_to_utc_naive(value))
    text = str(value)
    try:
        # dateutil's dayfirst flag isn't scoped to genuinely-ambiguous inputs
        # -- passing dayfirst=True unconditionally corrupts unambiguous
        # "YYYY-MM-DD..." strings too (Greenhouse's "...Z" timestamps,
        # Lever's constructed ISO strings), silently swapping day/month for
        # any date where day<=12. Only dot-separated DD.MM.YYYY strings (this
        # pipeline's designated market, market_de, uses that convention) are
        # actually ambiguous, so dayfirst is scoped to just that shape.
        parsed = date_parser.parse(text, dayfirst=bool(_DOTTED_DATE_RE.match(text)))
        return _reject_future(_to_utc_naive(parsed))
    except (ValueError, TypeError, OverflowError):
        return None


# Keys from extract_common_fields() that land in a NOT NULL text column on
# raw_jobs (see _RAW_JOB_COLUMNS and schema.prisma's RawJob).
_REQUIRED_TEXT_KEYS = (
    "original_job_id",
    "source_url",
    "company_name_raw",
    "job_title_raw",
    "description_text",
    "location_raw",
    "apply_url",
)


def _coerce_required_text(common: dict) -> dict:
    """Replace None with "" for every field bound for a NOT NULL text column.

    The adapters guard with `payload.get(key, "")`, which does NOT protect
    against a key that is *present* with value None - and that is exactly what
    the XML adapters produce: personio's `_position_to_dict` builds its dict
    from `text_of()`, which returns None both for a missing tag and for an
    empty one (`<office></office>`). So `payload.get("office", "")` returned
    None, `locationRaw`/`jobTitleRaw` went to the INSERT as NULL, and Postgres
    rejected the row.

    That failure was not contained: run_pipeline.py had no per-source error
    isolation, so one malformed posting out of ~100 Personio tenants aborted
    the whole invocation before run_dedup() and near-duplicate clustering ever
    ran - no source got its canonical_jobs updated that tick, and the next
    scheduled run hit the same payload again. (That second half is fixed in
    run_pipeline.py; this is the first half.)

    Normalizing here rather than in each adapter keeps the guarantee in one
    place and extends it to adapters added later. "" is the right value, not a
    sentinel: normalize_location() already degrades "" to "Unknown".

    A missing TITLE is different from a missing location, though, and is not
    coerced into a row: "" satisfies the NOT NULL constraint, so the row would
    insert cleanly, cluster with every other untitled posting from the same
    company, and surface as a blank job card linking to a titleless posting.
    run_normalizer() skips those instead - see the guard there. This docstring
    previously claimed that skip already existed when it did not.
    """
    return {key: (common.get(key) or "") if key in _REQUIRED_TEXT_KEYS else value
            for key, value in {**{k: None for k in _REQUIRED_TEXT_KEYS}, **common}.items()}


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
    common = _coerce_required_text(extract_common_fields(source_type, payload))

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
    remote_type = fields.infer_remote_type(
        common["location_raw"], common.get("remote_hint"), common["description_text"]
    )
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

    # Did any normalized value actually change? Every expression in a DO UPDATE
    # SET list is evaluated against the OLD row, so comparing "raw_jobs".<col>
    # against EXCLUDED.<col> here is a true before/after comparison even though
    # update_clause overwrites those same columns in the same statement.
    old_row = ", ".join(f'"raw_jobs"."{c}"' for c in _RAW_JOB_COLUMNS)
    new_row = ", ".join(f'EXCLUDED."{c}"' for c in _RAW_JOB_COLUMNS)
    content_changed = f"(({old_row}) IS DISTINCT FROM ({new_row}))"

    # Resetting isDeduplicated is what makes an EDITED posting propagate.
    # dedup.fetch_undeduplicated_raw_jobs() only ever picks up rows with
    # isDeduplicated = false, and nothing set it back to false, so once a job
    # had been deduped its canonical_jobs row was frozen forever. The normalizer
    # kept refreshing raw_jobs, so a posting that changed title or disclosed a
    # salary produced a visible split: search hard-filters and the match score
    # ran against the day-one jobTitleNormalized/salaryMin/techStackTags from
    # canonical_jobs, while the UI showed the fresh jobTitleRaw and description
    # read from raw_jobs (see canonical-job.mapper.ts, which reads normalized
    # fields from one table and raw fields from the other).
    #
    # Gated on content_changed rather than unconditional: re-deduping every
    # unchanged job on every 4-hourly run would be pure waste, and the crawler
    # already re-fetches every job every run.
    #
    # crawledAt moves with it, so it means last-seen rather than first-seen.
    cur.execute(
        f"""
        INSERT INTO "raw_jobs" ({", ".join(columns)})
        VALUES ({", ".join(placeholders)})
        ON CONFLICT ("sourceId", "originalJobId") DO UPDATE SET
            {update_clause},
            "isDeduplicated" = CASE WHEN {content_changed}
                THEN false ELSE "raw_jobs"."isDeduplicated" END,
            "crawledAt" = CASE WHEN {content_changed}
                THEN now() ELSE "raw_jobs"."crawledAt" END
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
    skipped_untitled = 0
    for snapshot in snapshots:
        row_fields = build_raw_job_fields(source_type, snapshot["payload"], location_dictionary)
        # A posting with no title is not a job we can show anyone: it would
        # render as an empty card and, because dedup clusters on (company,
        # title, location), every untitled posting from one company collapses
        # into a single blank entry. _coerce_required_text() deliberately keeps
        # the NOT NULL constraint from rejecting the row; this is what decides
        # the row is not worth having.
        if not row_fields["jobTitleRaw"].strip():
            skipped_untitled += 1
            continue
        upsert_raw_job(cur, source_id, row_fields)
        written += 1

    result = {"sourceId": source_id, "rawJobsWritten": written}
    if skipped_untitled:
        result["skippedUntitled"] = skipped_untitled
    return result
