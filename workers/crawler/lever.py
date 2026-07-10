"""Lever Postings API adapter.

Public, documented API (no auth required):
  GET https://api.lever.co/v0/postings/{site_slug}?mode=json

Response shape (subset we care about):
[
  {
    "id": "abc-123",
    "text": "Senior Backend Engineer",
    "hostedUrl": "https://jobs.lever.co/acme/abc-123",
    "categories": {"location": "Berlin, Germany", "team": "Engineering", "commitment": "Full-time"},
    "descriptionPlain": "...",
    "description": "<div>...</div>",
    "createdAt": 1717000000000  # epoch millis
  },
  ...
]

`config.siteSlugs` (list[str]) lists the Lever site slugs (one per company)
this source should crawl. Starts empty in market-de.
"""
from __future__ import annotations

from crawler.base import HttpClient, RawPayload, TransientFetchError, enforce_domain_allowlist, retryable

BASE_HOST = "api.lever.co"


def _postings_url(site_slug: str) -> str:
    return f"https://{BASE_HOST}/v0/postings/{site_slug}?mode=json"


@retryable()
def _get(client: HttpClient, url: str) -> list:
    try:
        resp = client.get(url, timeout=10.0)
    except Exception as exc:  # noqa: BLE001
        raise TransientFetchError(str(exc)) from exc
    if resp.status_code >= 500:
        raise TransientFetchError(f"Lever returned {resp.status_code} for {url}")
    if resp.status_code != 200:
        raise RuntimeError(f"Lever returned {resp.status_code} for {url}")
    return resp.json()


def fetch(client: HttpClient, config: dict, domain_allowlist: list[str]) -> list[RawPayload]:
    site_slugs: list[str] = config.get("siteSlugs", [])
    payloads: list[RawPayload] = []

    for slug in site_slugs:
        url = _postings_url(slug)
        enforce_domain_allowlist(url, domain_allowlist)
        data = _get(client, url)
        for job in data:
            payloads.append(
                RawPayload(
                    original_job_id=str(job["id"]),
                    payload={**job, "_site_slug": slug},
                    fetched_at=RawPayload.now_iso(),
                )
            )
    return payloads


# Note: mapping this raw Lever payload shape to the pipeline's common
# intermediate fields is a normalization concern -- see
# normalizer/extractors.py:extract_lever.
