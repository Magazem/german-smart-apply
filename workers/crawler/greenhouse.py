"""Greenhouse Job Board API adapter.

Public, documented API (no auth required for public job boards):
  GET https://boards-api.greenhouse.io/v1/boards/{board_token}/jobs?content=true

Response shape (subset we care about):
{
  "jobs": [
    {
      "id": 123456,
      "title": "Senior Backend Engineer",
      "updated_at": "2026-06-01T10:00:00Z",
      "location": {"name": "Berlin, Germany"},
      "absolute_url": "https://boards.greenhouse.io/acme/jobs/123456",
      "content": "<p>...</p>",
      "company_name": "Acme GmbH"   # not always present; falls back to config
    },
    ...
  ]
}

`config.boardTokens` (list[str]) lists the Greenhouse board tokens (one per
company) this source should crawl. It starts empty in market-de and is meant
to be populated as trusted DE companies on Greenhouse are identified.
"""
from __future__ import annotations

from crawler.base import HttpClient, RawPayload, TransientFetchError, enforce_domain_allowlist, retryable

BASE_HOST = "boards-api.greenhouse.io"


def _board_url(board_token: str) -> str:
    return f"https://{BASE_HOST}/v1/boards/{board_token}/jobs?content=true"


@retryable()
def _get(client: HttpClient, url: str) -> dict:
    try:
        resp = client.get(url, timeout=10.0)
    except Exception as exc:  # noqa: BLE001 - network errors of any kind are transient
        raise TransientFetchError(str(exc)) from exc
    if resp.status_code >= 500:
        raise TransientFetchError(f"Greenhouse returned {resp.status_code} for {url}")
    if resp.status_code != 200:
        raise RuntimeError(f"Greenhouse returned {resp.status_code} for {url}")
    return resp.json()


def fetch(client: HttpClient, config: dict, domain_allowlist: list[str]) -> list[RawPayload]:
    """Fetch all jobs for every board token configured for this source."""
    board_tokens: list[str] = config.get("boardTokens", [])
    payloads: list[RawPayload] = []

    for token in board_tokens:
        url = _board_url(token)
        enforce_domain_allowlist(url, domain_allowlist)
        data = _get(client, url)
        for job in data.get("jobs", []):
            payloads.append(
                RawPayload(
                    original_job_id=str(job["id"]),
                    payload={**job, "_board_token": token},
                    fetched_at=RawPayload.now_iso(),
                )
            )
    return payloads


# Note: mapping this raw Greenhouse payload shape to the pipeline's common
# intermediate fields is a normalization concern, not a crawling concern -- see
# normalizer/extractors.py:extract_greenhouse. The crawler only fetches and
# returns raw JSON as-is.
