"""SmartRecruiters Posting API adapter.

Public, documented API (no auth required for public postings):
  GET https://api.smartrecruiters.com/v1/companies/{company_identifier}/postings

Response shape (subset we care about, per SmartRecruiters' public Posting API):
{
  "totalFound": 12,
  "content": [
    {
      "id": "744000012345678",
      "name": "Senior Backend Engineer (m/f/d)",
      "refNumber": "REQ-1234",
      "company": {"identifier": "acme", "name": "Acme GmbH"},
      "releasedDate": "2026-06-01T10:00:00.000Z",
      "location": {"city": "Berlin", "region": "Berlin", "country": "de", "remote": false},
      "department": {"label": "Engineering"},
      "typeOfEmployment": {"label": "Full-time"},
      "jobAd": {
        "sections": {
          "jobDescription": {"title": "Job Description", "text": "<p>...</p>"},
          "qualifications": {"title": "Qualifications", "text": "<p>...</p>"}
        }
      },
      "ref": "https://api.smartrecruiters.com/v1/companies/acme/postings/744000012345678"
    }
  ]
}

The base `/postings` list response includes full `jobAd` content when queried
without pagination-only fields, which is what this adapter relies on rather
than making a second per-posting detail request per job.

The list response is paginated (`limit`/`offset` query params, `totalFound`
in the response body) and defaults to only the first `limit` (100) postings
per call -- live-verified against the real API: a company with 947 open
postings returned only the first 100 without `offset`, so `fetch()` below
pages through `offset` until it catches up with `totalFound`, bounded by
`max_jobs_per_company` as a safety valve against a runaway loop.

`config.companyIdentifiers` (list[str]) lists the SmartRecruiters company
identifiers (one per company) this source should crawl. Starts empty in
market-de.
"""
from __future__ import annotations

from crawler.base import HttpClient, RawPayload, TransientFetchError, enforce_domain_allowlist, retryable

BASE_HOST = "api.smartrecruiters.com"
DEFAULT_PAGE_LIMIT = 100
DEFAULT_MAX_JOBS_PER_COMPANY = 5000


def _postings_url(company_identifier: str, offset: int = 0, limit: int = DEFAULT_PAGE_LIMIT) -> str:
    return f"https://{BASE_HOST}/v1/companies/{company_identifier}/postings?offset={offset}&limit={limit}"


@retryable()
def _get(client: HttpClient, url: str) -> dict:
    try:
        resp = client.get(url, timeout=10.0)
    except Exception as exc:  # noqa: BLE001 - network errors of any kind are transient
        raise TransientFetchError(str(exc)) from exc
    if resp.status_code >= 500:
        raise TransientFetchError(f"SmartRecruiters returned {resp.status_code} for {url}")
    if resp.status_code != 200:
        raise RuntimeError(f"SmartRecruiters returned {resp.status_code} for {url}")
    return resp.json()


def fetch(
    client: HttpClient,
    config: dict,
    domain_allowlist: list[str],
    limit: int = DEFAULT_PAGE_LIMIT,
    max_jobs_per_company: int = DEFAULT_MAX_JOBS_PER_COMPANY,
) -> list[RawPayload]:
    """Fetch all postings for every SmartRecruiters company configured for
    this source, paging via `offset` until `totalFound` is exhausted (or a
    short page confirms there's nothing left) -- see the module docstring for
    why this can't just take the first page.
    """
    company_identifiers: list[str] = config.get("companyIdentifiers", [])
    payloads: list[RawPayload] = []

    for identifier in company_identifiers:
        offset = 0
        fetched_for_company = 0
        while fetched_for_company < max_jobs_per_company:
            url = _postings_url(identifier, offset=offset, limit=limit)
            enforce_domain_allowlist(url, domain_allowlist)
            data = _get(client, url)
            content = data.get("content", [])
            for posting in content:
                payloads.append(
                    RawPayload(
                        original_job_id=str(posting["id"]),
                        payload=posting,
                        fetched_at=RawPayload.now_iso(),
                    )
                )
            fetched_for_company += len(content)
            total_found = data.get("totalFound", offset + len(content))
            offset += len(content)
            if len(content) < limit or offset >= total_found:
                break
    return payloads


# Note: mapping this raw SmartRecruiters payload shape to the pipeline's common
# intermediate fields is a normalization concern -- see
# normalizer/extractors.py:extract_smartrecruiters.
