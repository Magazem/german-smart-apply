"""Bundesagentur für Arbeit ("Arbeitsagentur") Jobsuche API adapter.

This is a real, public, documented-by-usage German government API:
  GET https://rest.arbeitsagentur.de/jobboerse/jobsuche-service/pc/v4/jobs

It requires a static client header that BA has published for public use of the
job search API (not a secret -- it's the same value used by BA's own Jobsuche
web frontend and widely documented in community integrations):
  X-API-Key: jobboerse-jobsuche

Query params we use: `was` (free-text search term, e.g. a target role) and
`wo` (location, e.g. a city or postcode), plus paging via `page`/`size`.

Response shape (subset we care about):
{
  "maxErgebnisse": 123,
  "stellenangebote": [
    {
      "refnr": "10000-1234567890-S",
      "titel": "Senior Backend Engineer (m/w/d)",
      "arbeitgeber": "Acme GmbH",
      "arbeitsort": {"ort": "Berlin", "plz": "10115", "region": "Berlin", "land": "Deutschland"},
      "eintrittsdatum": "2026-08-01",
      "aktuelleVeroeffentlichungsdatum": "2026-07-01",
      "modifikationsTimestamp": "2026-07-01T08:00:00.000Z",
      "externeUrl": "https://acme.example/karriere/12345"
    },
    ...
  ]
}

Notably, the search response above never includes a description - full
listing text only comes from a separate per-job detail call:
  GET {base}/pc/v4/jobdetails/{base64(refnr)}
  { ..., "stellenangebotsBeschreibung": "### Stellenbeschreibung\n\n..." }
The path segment is NOT the raw refnr - it's the refnr, base64-encoded
(confirmed live: rest.arbeitsagentur.de/.../pc/v4/jobdetails/10001-... 404s;
base64-encoding the refnr first returns 200 with a real
stellenangebotsBeschreibung field). Community-documented shape, verified
against the live API on 2026-07-13:
https://github.com/bundesAPI/jobsuche-api - see openapi.yaml and issue #47.
`fetch()` below makes one such call per listing to populate
stellenangebotsBeschreibung before handing the payload off to the
normalizer - extract_arbeitsagentur() reads that field. This roughly
doubles the request count for this source; a failed detail call degrades to
an empty description for that one listing rather than dropping it or
aborting the whole batch.

TODO: rate limits for both endpoints are still not covered by an official
public OpenAPI spec at the time of writing. Add pagination beyond a single
page if `maxErgebnisse` exceeds the page size.
"""
from __future__ import annotations

import base64

from crawler.base import HttpClient, RawPayload, TransientFetchError, enforce_domain_allowlist, retryable

BASE_HOST = "rest.arbeitsagentur.de"
API_KEY_HEADER = {"X-API-Key": "jobboerse-jobsuche"}


def _search_url(base_url: str, was: str, wo: str, size: int, page: int) -> str:
    base = base_url.rstrip("/")
    return f"{base}/pc/v4/jobs?was={was}&wo={wo}&size={size}&page={page}"


def _detail_url(base_url: str, refnr: str) -> str:
    base = base_url.rstrip("/")
    encoded = base64.b64encode(refnr.encode("utf-8")).decode("ascii")
    return f"{base}/pc/v4/jobdetails/{encoded}"


@retryable()
def _get(client: HttpClient, url: str) -> dict:
    try:
        resp = client.get(url, headers=API_KEY_HEADER, timeout=10.0)
    except Exception as exc:  # noqa: BLE001
        raise TransientFetchError(str(exc)) from exc
    if resp.status_code >= 500:
        raise TransientFetchError(f"Arbeitsagentur returned {resp.status_code} for {url}")
    if resp.status_code != 200:
        raise RuntimeError(f"Arbeitsagentur returned {resp.status_code} for {url}")
    return resp.json()


def _fetch_description(client: HttpClient, base_url: str, refnr: str, domain_allowlist: list[str]) -> str:
    """The search endpoint never returns a description (see module
    docstring) - only the per-job jobdetails endpoint does. A fetch failure
    here (404, exhausted retries, network error) degrades to an empty
    description rather than dropping the whole listing or aborting the
    batch: a listing with no description is strictly better than losing a
    real posting entirely. A domain-allowlist failure is NOT swallowed here
    though - that's a governance/config bug that must fail loudly, same as
    the search call.
    """
    url = _detail_url(base_url, refnr)
    enforce_domain_allowlist(url, domain_allowlist)
    try:
        detail = _get(client, url)
    except (TransientFetchError, RuntimeError):
        return ""
    return detail.get("stellenangebotsBeschreibung", "") or ""


def fetch(
    client: HttpClient,
    config: dict,
    domain_allowlist: list[str],
    search_terms: list[str] | None = None,
    size: int = 50,
) -> list[RawPayload]:
    """Fetch job postings for each search term configured for this source.

    `search_terms` defaults to a small set of target roles; in production this
    would be driven by aggregate demand across candidate profiles, but Phase 1
    just needs a working, testable adapter shape.
    """
    base_url = config.get("baseUrl", f"https://{BASE_HOST}/jobboerse/jobsuche-service")
    terms = search_terms or config.get("searchTerms", ["Software Engineer"])
    payloads: list[RawPayload] = []

    for term in terms:
        url = _search_url(base_url, was=term, wo="Deutschland", size=size, page=1)
        enforce_domain_allowlist(url, domain_allowlist)
        data = _get(client, url)
        for job in data.get("stellenangebote", []):
            refnr = job.get("refnr")
            if not refnr:
                continue
            enriched = dict(job)
            enriched["stellenangebotsBeschreibung"] = _fetch_description(client, base_url, str(refnr), domain_allowlist)
            payloads.append(
                RawPayload(
                    original_job_id=str(refnr),
                    payload=enriched,
                    fetched_at=RawPayload.now_iso(),
                )
            )
    return payloads


# Note: mapping this raw Arbeitsagentur payload shape to the pipeline's common
# intermediate fields is a normalization concern -- see
# normalizer/extractors.py:extract_arbeitsagentur.
