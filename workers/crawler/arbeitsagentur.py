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

Rate limits for both endpoints are still not covered by an official public
OpenAPI spec, so `fetch()` below deliberately bounds its own worst case
(DEFAULT_MAX_PAGES_PER_TERM, DEFAULT_MAX_TOTAL_JOBS) rather than paginating
every search term to exhaustion -- this is a real government API with
undocumented throttling, crawled 4x/day (see market_de.py's
crawlFrequencyMinutes), and every listing costs a second detail-endpoint
request on top of the search request. Start conservative; the caps are
plain function parameters (or config.maxTotalJobs/config.searchTerms) that
can be raised once real crawl-run behavior against the live API is observed.
"""
from __future__ import annotations

import base64

from crawler.base import HttpClient, RawPayload, TransientFetchError, enforce_domain_allowlist, retryable

BASE_HOST = "rest.arbeitsagentur.de"
API_KEY_HEADER = {"X-API-Key": "jobboerse-jobsuche"}

# Page size for the search endpoint. Live-verified against the real API:
# size=20/100/200/300/500 all returned exactly the requested count, size=1000
# silently returned 0 results (an undocumented cap somewhere above 500).
#
# Deliberately kept small (not the largest safe value) for a second reason
# beyond request cost: fetch() below visits search terms in round-robin order
# (page 1 of every term before page 2 of any term) specifically so
# DEFAULT_MAX_TOTAL_JOBS gets spread across every occupation category in
# DEFAULT_SEARCH_TERMS rather than exhausted by the first few. That guarantee
# only holds if len(DEFAULT_SEARCH_TERMS) * DEFAULT_PAGE_SIZE stays
# comfortably under DEFAULT_MAX_TOTAL_JOBS -- at size=100 with today's ~40
# terms, the first ~10 high-volume terms alone (all tech/sales) would each
# fill a full 100-result page and exhaust the entire 1000 cap before
# healthcare/logistics/admin/retail/education/consulting ever got a single
# request, silently reproducing the exact narrow-coverage bug this file was
# changed to fix. Keep this relationship in mind (len(terms) * size well
# under DEFAULT_MAX_TOTAL_JOBS) when editing any of the three.
DEFAULT_PAGE_SIZE = 20

# How many pages deep to go per search term before moving to the next term
# (in round-robin order -- see DEFAULT_PAGE_SIZE's comment). Terms that are
# still short of DEFAULT_MAX_TOTAL_JOBS after every term's first page get a
# second, deeper pass; low-volume terms drop out of rotation earlier (see
# fetch()'s exhausted_terms tracking).
DEFAULT_MAX_PAGES_PER_TERM = 2

# Hard ceiling on unique jobs fetched per fetch() call, across every search
# term combined -- see the module docstring for why this exists. Every job
# beyond this cap costs a real detail-endpoint request against an API with
# unknown rate limits, and every job fetched appends a permanent row to the
# append-only raw_job_snapshots history table (no unique constraint there --
# see runner.run_crawl), so this is not just a latency knob.
DEFAULT_MAX_TOTAL_JOBS = 1000

# Search terms spanning the occupation categories this platform actually
# ranks/matches against (see packages/market-de's titleEquivalenceClasses
# and rankingWeights), not just tech -- the previous default of a single
# "Software Engineer" term meant every non-tech candidate profile had
# essentially no Arbeitsagentur jobs to match against. Mixes German terms
# (the primary language of this API's index) with the English tech titles
# that are commonly posted verbatim even by German employers. Overridable
# via config.searchTerms; kept here (not in market_de.py/the TS mirror) so
# growing this list never requires a Python/TypeScript sync.
DEFAULT_SEARCH_TERMS = [
    # Tech / IT
    "Softwareentwickler",
    "Software Engineer",
    "Data Scientist",
    "Data Engineer",
    "DevOps Engineer",
    "Systemadministrator",
    "IT-Support",
    "Product Manager",
    "UX Designer",
    # Sales / Marketing
    "Vertriebsmitarbeiter",
    "Sales Manager",
    "Marketing Manager",
    "Online Marketing Manager",
    "Werbetexter",
    # HR
    "Personalreferent",
    "HR Manager",
    "Recruiter",
    # Finance / Accounting
    "Buchhalter",
    "Bilanzbuchhalter",
    "Controller",
    "Finanzanalyst",
    # Legal
    "Justiziar",
    "Rechtsanwaltsfachangestellte",
    # Customer service
    "Kundenservice",
    "Kundenberater",
    # Healthcare
    "Gesundheits- und Krankenpfleger",
    "Pflegefachkraft",
    "Medizinische Fachangestellte",
    # Logistics / operations
    "Lagerlogistik",
    "Supply Chain Manager",
    "Disponent",
    # Engineering (non-software)
    "Maschinenbauingenieur",
    "Elektroingenieur",
    "Projektingenieur",
    # Admin / office
    "Bürokaufmann",
    "Assistenz der Geschäftsführung",
    "Verwaltungsfachangestellte",
    # Retail / hospitality
    "Einzelhandelskaufmann",
    "Hotelfachmann",
    # Education
    "Erzieher",
    # Consulting
    "Unternehmensberater",
]


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
    size: int = DEFAULT_PAGE_SIZE,
    max_pages_per_term: int = DEFAULT_MAX_PAGES_PER_TERM,
    max_total_jobs: int = DEFAULT_MAX_TOTAL_JOBS,
) -> list[RawPayload]:
    """Fetch job postings for each search term configured for this source,
    deduping by refnr across every term/page in this call.

    Iterates in ROUND-ROBIN order -- page 1 of every term, then page 2 of
    every term still returning full pages, and so on -- rather than
    exhausting one term's pages before moving to the next. With ~40 terms
    spanning many occupation categories (see DEFAULT_SEARCH_TERMS) and a
    global max_total_jobs cap, exhausting terms in list order would spend the
    entire cap on the first several terms (tech, then sales) before the cap
    is hit, so categories later in the list (healthcare, logistics,
    education, ...) would never get queried at all -- exactly the breadth
    DEFAULT_SEARCH_TERMS exists to provide. Round-robin instead gives every
    term at least one page before any term gets a second.

    A term drops out of rotation (stops getting further pages) the moment
    one of its pages comes back empty or shorter than `size`, since that's
    the real end-of-results signal for that term.

    The refnr dedup matters beyond avoiding wasted work: without it, a job
    that legitimately matches two search terms (e.g. "Softwareentwickler" and
    "Software Engineer" both matching the same real posting) would otherwise
    get fetched, detail-enriched, and appended to raw_job_snapshots' append-
    only history twice in the same run, for no benefit downstream.

    `search_terms` resolves from the explicit parameter, then
    `config.searchTerms`, then DEFAULT_SEARCH_TERMS -- in that order, so a
    caller can still target one specific term (as the test suite does)
    without needing to touch config.
    """
    base_url = config.get("baseUrl", f"https://{BASE_HOST}/jobboerse/jobsuche-service")
    terms = search_terms or config.get("searchTerms") or DEFAULT_SEARCH_TERMS
    payloads: list[RawPayload] = []
    seen_refnrs: set[str] = set()
    exhausted_terms: set[str] = set()

    for page in range(1, max_pages_per_term + 1):
        if len(seen_refnrs) >= max_total_jobs:
            break
        for term in terms:
            if term in exhausted_terms:
                continue
            if len(seen_refnrs) >= max_total_jobs:
                break
            url = _search_url(base_url, was=term, wo="Deutschland", size=size, page=page)
            enforce_domain_allowlist(url, domain_allowlist)
            data = _get(client, url)
            listings = data.get("stellenangebote", [])
            if not listings:
                exhausted_terms.add(term)
                continue
            for job in listings:
                if len(seen_refnrs) >= max_total_jobs:
                    break
                refnr = job.get("refnr")
                if not refnr or refnr in seen_refnrs:
                    continue
                seen_refnrs.add(refnr)
                enriched = dict(job)
                enriched["stellenangebotsBeschreibung"] = _fetch_description(client, base_url, str(refnr), domain_allowlist)
                payloads.append(
                    RawPayload(
                        original_job_id=str(refnr),
                        payload=enriched,
                        fetched_at=RawPayload.now_iso(),
                    )
                )
            if len(listings) < size:
                exhausted_terms.add(term)
    return payloads


# Note: mapping this raw Arbeitsagentur payload shape to the pipeline's common
# intermediate fields is a normalization concern -- see
# normalizer/extractors.py:extract_arbeitsagentur.
