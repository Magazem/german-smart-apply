"""Crawl scheduler/runner: dispatches to the right source adapter, records a
source_crawl_runs row per run, and persists every fetched payload into
raw_job_snapshots.

This module owns the only "commit" boundary that matters for a crawl: callers
(a CLI entrypoint or a test) decide when to call conn.commit().
"""
from __future__ import annotations

import json
import uuid
from datetime import datetime, timezone
from typing import Any

from tenacity import Retrying, retry_if_exception_type, stop_after_attempt, wait_exponential

from crawler import arbeitsagentur, greenhouse, lever, personio, smartrecruiters, stepstone
from crawler.base import DomainNotAllowedError, HttpClient, RawPayload, TransientFetchError

ADAPTERS = {
    "greenhouse": greenhouse,
    "lever": lever,
    "arbeitsagentur": arbeitsagentur,
    "stepstone": stepstone,
    "personio": personio,
    "smartrecruiters": smartrecruiters,
}


def _now() -> datetime:
    return datetime.now(timezone.utc)


def fetch_source(client: HttpClient, source_row: dict) -> list[RawPayload]:
    """Dispatch to the adapter matching source_row['sourceType']."""
    source_type = source_row["sourceType"]
    adapter = ADAPTERS.get(source_type)
    if adapter is None:
        raise ValueError(f"No adapter registered for sourceType={source_type!r}")
    config = source_row.get("config") or {}
    allowlist = source_row.get("domainAllowlist") or []
    return adapter.fetch(client, config, allowlist)


def _existing_snapshot_count(cur, source_id: str, original_job_id: str) -> int:
    cur.execute(
        'SELECT COUNT(*) FROM "raw_job_snapshots" WHERE "sourceId" = %s AND "originalJobId" = %s',
        (source_id, original_job_id),
    )
    return cur.fetchone()[0]


def _insert_crawl_run(cur, run_id: str, source_id: str, started_at: datetime) -> None:
    cur.execute(
        """
        INSERT INTO "source_crawl_runs"
            ("id", "sourceId", "status", "startedAt", "jobsFetched", "jobsNew", "jobsUpdated", "retryCount")
        VALUES (%s, %s, 'running', %s, 0, 0, 0, 0)
        """,
        (run_id, source_id, started_at),
    )


def _finalize_crawl_run(
    cur,
    run_id: str,
    status: str,
    finished_at: datetime,
    jobs_fetched: int,
    jobs_new: int,
    jobs_updated: int,
    error_log: str | None,
    retry_count: int,
) -> None:
    cur.execute(
        """
        UPDATE "source_crawl_runs"
        SET "status" = %s, "finishedAt" = %s, "jobsFetched" = %s, "jobsNew" = %s,
            "jobsUpdated" = %s, "errorLog" = %s, "retryCount" = %s
        WHERE "id" = %s
        """,
        (status, finished_at, jobs_fetched, jobs_new, jobs_updated, error_log, retry_count, run_id),
    )


def _insert_snapshot(cur, source_id: str, payload: RawPayload) -> str:
    snapshot_id = str(uuid.uuid4())
    cur.execute(
        """
        INSERT INTO "raw_job_snapshots" ("id", "sourceId", "originalJobId", "payload", "fetchedAt")
        VALUES (%s, %s, %s, %s, %s)
        """,
        (snapshot_id, source_id, payload.original_job_id, json.dumps(payload.payload), payload.fetched_at),
    )
    return snapshot_id


def run_crawl(conn, client: HttpClient, source_row: dict) -> dict[str, Any]:
    """Execute one crawl run for a single source. Returns a summary dict.

    Retries the whole-source fetch (coarse granularity) on TransientFetchError
    via tenacity's Retrying, on top of each adapter's own per-request retry
    around individual HTTP calls (fine granularity). DomainNotAllowedError is
    never retried -- it is a hard governance rejection.
    """
    cur = conn.cursor()
    run_id = str(uuid.uuid4())
    source_id = source_row["id"]
    started_at = _now()
    _insert_crawl_run(cur, run_id, source_id, started_at)

    retryer = Retrying(
        reraise=True,
        stop=stop_after_attempt(3),
        wait=wait_exponential(multiplier=0.1, min=0.1, max=2),
        retry=retry_if_exception_type(TransientFetchError),
    )

    try:
        payloads = retryer(fetch_source, client, source_row)
        retry_count = retryer.statistics.get("attempt_number", 1) - 1
    except DomainNotAllowedError as exc:
        _finalize_crawl_run(cur, run_id, "failure", _now(), 0, 0, 0, str(exc), 0)
        return {"run_id": run_id, "status": "failure", "error": str(exc)}
    except Exception as exc:  # noqa: BLE001 - persist any adapter failure as a failed run
        retry_count = getattr(retryer, "statistics", {}).get("attempt_number", 1) - 1
        _finalize_crawl_run(cur, run_id, "failure", _now(), 0, 0, 0, str(exc), max(retry_count, 0))
        return {"run_id": run_id, "status": "failure", "error": str(exc)}

    jobs_new = 0
    jobs_updated = 0
    for payload in payloads:
        if _existing_snapshot_count(cur, source_id, payload.original_job_id) == 0:
            jobs_new += 1
        else:
            jobs_updated += 1
        _insert_snapshot(cur, source_id, payload)

    # Reaching this point means fetch_source succeeded (possibly with zero
    # results, e.g. a source configured with no board tokens/feed URLs yet).
    status = "success"
    _finalize_crawl_run(
        cur,
        run_id,
        status,
        _now(),
        jobs_fetched=len(payloads),
        jobs_new=jobs_new,
        jobs_updated=jobs_updated,
        error_log=None,
        retry_count=max(retry_count, 0),
    )
    return {
        "run_id": run_id,
        "status": status,
        "jobsFetched": len(payloads),
        "jobsNew": jobs_new,
        "jobsUpdated": jobs_updated,
        "retryCount": max(retry_count, 0),
    }
