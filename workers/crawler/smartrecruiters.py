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
than making a second per-posting detail request per job (keeping this adapter
to one HTTP call per company, like Greenhouse/Lever).

`config.companyIdentifiers` (list[str]) lists the SmartRecruiters company
identifiers (one per company) this source should crawl. Starts empty in
market-de.
"""
from __future__ import annotations

from crawler.base import HttpClient, RawPayload, TransientFetchError, enforce_domain_allowlist, retryable

BASE_HOST = "api.smartrecruiters.com"


def _postings_url(company_identifier: str) -> str:
    return f"https://{BASE_HOST}/v1/companies/{company_identifier}/postings"


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


def fetch(client: HttpClient, config: dict, domain_allowlist: list[str]) -> list[RawPayload]:
    """Fetch all postings for every SmartRecruiters company configured for this source."""
    company_identifiers: list[str] = config.get("companyIdentifiers", [])
    payloads: list[RawPayload] = []

    for identifier in company_identifiers:
        url = _postings_url(identifier)
        enforce_domain_allowlist(url, domain_allowlist)
        data = _get(client, url)
        for posting in data.get("content", []):
            payloads.append(
                RawPayload(
                    original_job_id=str(posting["id"]),
                    payload=posting,
                    fetched_at=RawPayload.now_iso(),
                )
            )
    return payloads


# Note: mapping this raw SmartRecruiters payload shape to the pipeline's common
# intermediate fields is a normalization concern -- see
# normalizer/extractors.py:extract_smartrecruiters.
