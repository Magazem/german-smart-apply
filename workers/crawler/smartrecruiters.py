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

IMPORTANT: the `jobAd` block above is NOT part of the list response. The
`/postings` list endpoint returns only summary fields (id, name, uuid,
jobAdId, refNumber, company, releasedDate, location, industry, department,
function, typeOfEmployment, experienceLevel, customField, ref, visibility) --
live-verified against the real API on 2026-07-23, where every entry in
Continental's 945-posting list came back with no `jobAd` key at all. The
adapter previously assumed otherwise, so `extract_smartrecruiters` found an
empty `sections` dict and every SmartRecruiters job landed with a blank
description.

The full job ad only comes from the per-posting detail endpoint:
  GET https://api.smartrecruiters.com/v1/companies/{company_identifier}/postings/{posting_id}
  { ..., "jobAd": {"sections": {"companyDescription": {...},
                                "jobDescription": {...},
                                "qualifications": {...},
                                "additionalInformation": {...}}},
        "applyUrl": "...", "postingUrl": "..." }
`fetch()` below makes one such call per listing and merges `jobAd` (plus the
authoritative `applyUrl`/`postingUrl`) into the payload before handing it to
the normalizer. This mirrors arbeitsagentur.py, which pays the same
one-detail-call-per-listing cost for the same reason, and likewise degrades a
failed detail call to an empty description for that one listing rather than
dropping it or aborting the batch.

COST NOTE: combined with the pagination below this is ~1 extra request per
posting (Continental alone is ~945), so a full crawl of this source is now
dominated by detail calls. That is the only way to get descriptions from this
API; if it becomes a problem the lever is `max_jobs_per_company`, not
skipping the detail call.

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


def _posting_detail_url(company_identifier: str, posting_id: str) -> str:
    return f"https://{BASE_HOST}/v1/companies/{company_identifier}/postings/{posting_id}"


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


def _fetch_posting_detail(
    client: HttpClient, company_identifier: str, posting_id: str, domain_allowlist: list[str]
) -> dict:
    """Fetch one posting's detail record, whose `jobAd.sections` is the only
    place the actual job description lives (see module docstring).

    A fetch failure (404, exhausted retries, network error) degrades to an
    empty dict -- the listing is still kept, just without a description,
    which is strictly better than losing a real posting entirely. A
    domain-allowlist failure is NOT swallowed: that's a governance/config
    bug that must fail loudly, same as the list call. Mirrors
    arbeitsagentur._fetch_description.
    """
    url = _posting_detail_url(company_identifier, posting_id)
    enforce_domain_allowlist(url, domain_allowlist)
    try:
        return _get(client, url)
    except (TransientFetchError, RuntimeError):
        return {}


def _merge_detail_into_posting(posting: dict, detail: dict) -> dict:
    """Copy the description-bearing fields off the detail record onto the
    list-summary posting. Only fields the list response genuinely lacks are
    copied, and only when present, so a degraded (empty) detail leaves the
    summary exactly as it was.
    """
    enriched = dict(posting)
    for key in ("jobAd", "applyUrl", "postingUrl"):
        if key in detail:
            enriched[key] = detail[key]
    return enriched


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
                posting_id = str(posting["id"])
                detail = _fetch_posting_detail(client, identifier, posting_id, domain_allowlist)
                payloads.append(
                    RawPayload(
                        original_job_id=posting_id,
                        payload=_merge_detail_into_posting(posting, detail),
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
