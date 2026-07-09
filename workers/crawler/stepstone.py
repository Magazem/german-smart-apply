"""Stepstone "structured feed" adapter.

TODO / KNOWN LIMITATION: Stepstone does not publish a documented public API or
feed format the way Greenhouse/Lever/Arbeitsagentur do. Many job boards (incl.
historically Stepstone-adjacent products) expose employer-specific structured
XML/JSON feeds (similar in spirit to an Indeed XML feed) rather than one global
search API. This adapter is written against a *reasonable, assumed* feed shape
so the rest of the pipeline (retry/backoff, domain allowlist, snapshot
persistence, normalization, dedup) can be built and tested end-to-end now. The
actual network integration is intentionally left as TODO:

  - Confirm whether Stepstone offers a partner/structured-data feed program,
    what auth it requires, and its real response schema.
  - Until then, `fetch()` accepts a list of feed URLs via config (config.feedUrls)
    and expects each URL to return JSON shaped like:
      {"jobs": [{"id": ..., "title": ..., "company": ..., "location": ...,
                 "description": ..., "url": ..., "postedAt": ...}, ...]}
  - This shape mirrors the other adapters closely enough that
    extract_common_fields below is a reasonable placeholder; revisit once the
    real feed contract is known.
"""
from __future__ import annotations

from crawler.base import HttpClient, RawPayload, TransientFetchError, enforce_domain_allowlist, retryable

BASE_HOST = "www.stepstone.de"


@retryable()
def _get(client: HttpClient, url: str) -> dict:
    try:
        resp = client.get(url, timeout=10.0)
    except Exception as exc:  # noqa: BLE001
        raise TransientFetchError(str(exc)) from exc
    if resp.status_code >= 500:
        raise TransientFetchError(f"Stepstone returned {resp.status_code} for {url}")
    if resp.status_code != 200:
        raise RuntimeError(f"Stepstone returned {resp.status_code} for {url}")
    return resp.json()


def fetch(client: HttpClient, config: dict, domain_allowlist: list[str]) -> list[RawPayload]:
    """Fetch jobs from each configured structured-feed URL.

    config.feedUrls defaults to [] (market-de ships no feed URLs yet -- see
    module TODO). An empty config yields an empty, valid result rather than
    an error, so the runner/scheduler behaves sanely while this integration
    is pending real feed access.
    """
    feed_urls: list[str] = config.get("feedUrls", [])
    payloads: list[RawPayload] = []

    for url in feed_urls:
        enforce_domain_allowlist(url, domain_allowlist)
        data = _get(client, url)
        for job in data.get("jobs", []):
            job_id = job.get("id")
            if not job_id:
                continue
            payloads.append(
                RawPayload(
                    original_job_id=str(job_id),
                    payload=job,
                    fetched_at=RawPayload.now_iso(),
                )
            )
    return payloads


# Note: mapping this raw Stepstone-shaped payload to the pipeline's common
# intermediate fields is a normalization concern -- see
# normalizer/extractors.py:extract_stepstone.
