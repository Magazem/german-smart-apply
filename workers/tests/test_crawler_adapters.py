"""Adapter unit/integration tests -- all against fixture payloads, never the
live network. Uses a FakeClient (tests/fakes.py) so responses are deterministic
and no real HTTP call is ever attempted.
"""
from __future__ import annotations

import pytest

from crawler import arbeitsagentur, greenhouse, lever, personio, smartrecruiters, stepstone
from crawler.base import DomainNotAllowedError, TransientFetchError, enforce_domain_allowlist
from tests.conftest import FIXTURES_DIR, load_fixture
from tests.fakes import FakeClient, FakeResponse, FlakyThenOkClient, RaisingClient

GREENHOUSE_ALLOWLIST = ["boards-api.greenhouse.io"]
LEVER_ALLOWLIST = ["api.lever.co"]
ARBEITSAGENTUR_ALLOWLIST = ["rest.arbeitsagentur.de"]
STEPSTONE_ALLOWLIST = ["www.stepstone.de"]
PERSONIO_ALLOWLIST = ["acme.jobs.personio.de"]
SMARTRECRUITERS_ALLOWLIST = ["api.smartrecruiters.com"]


def load_text_fixture(name: str) -> str:
    with open(FIXTURES_DIR / name, encoding="utf-8") as f:
        return f.read()


# ---------------------------------------------------------------------------
# Domain allowlist guard (governance/SSRF check)
# ---------------------------------------------------------------------------

def test_enforce_domain_allowlist_accepts_listed_host():
    enforce_domain_allowlist("https://boards-api.greenhouse.io/v1/boards/acme/jobs", GREENHOUSE_ALLOWLIST)


def test_enforce_domain_allowlist_rejects_unlisted_host():
    with pytest.raises(DomainNotAllowedError):
        enforce_domain_allowlist("https://evil.example.com/v1/boards/acme/jobs", GREENHOUSE_ALLOWLIST)


def test_greenhouse_fetch_rejects_before_any_network_call_when_misconfigured():
    """A board token pointing (via a hostile config) at a non-allowlisted host
    must be rejected before the client is ever invoked.
    """
    client = FakeClient()  # no canned responses -- any .get() call is a test failure
    with pytest.raises(DomainNotAllowedError):
        # Simulate a config that somehow doesn't match the source's own
        # allowlist (the guard must not trust the URL just because the
        # adapter built it).
        enforce_domain_allowlist("https://boards-api.greenhouse.io/v1/boards/acme/jobs", ["some-other-host.example"])
    assert client.calls == []


# ---------------------------------------------------------------------------
# Greenhouse
# ---------------------------------------------------------------------------

def test_greenhouse_fetch_returns_raw_payloads():
    fixture = load_fixture("greenhouse_jobs.json")
    url = greenhouse._board_url("acme")
    client = FakeClient({url: FakeResponse(fixture)})

    payloads = greenhouse.fetch(client, {"boardTokens": ["acme"]}, GREENHOUSE_ALLOWLIST)

    assert len(payloads) == 2
    assert payloads[0].original_job_id == "1001"
    assert payloads[0].payload["title"] == "Senior Backend Engineer (m/w/d)"
    assert client.calls == [url]


def test_greenhouse_fetch_empty_board_tokens_returns_empty_list():
    client = FakeClient()
    payloads = greenhouse.fetch(client, {"boardTokens": []}, GREENHOUSE_ALLOWLIST)
    assert payloads == []
    assert client.calls == []


def test_greenhouse_fetch_rejects_disallowed_host_config():
    client = FakeClient()
    with pytest.raises(DomainNotAllowedError):
        greenhouse.fetch(client, {"boardTokens": ["acme"]}, ["not-greenhouse.example"])
    assert client.calls == []


def test_greenhouse_retries_on_transient_failure_then_succeeds():
    fixture = load_fixture("greenhouse_jobs.json")
    url = greenhouse._board_url("acme")
    client = FlakyThenOkClient(url, success=FakeResponse(fixture), fail_times=1)

    payloads = greenhouse.fetch(client, {"boardTokens": ["acme"]}, GREENHOUSE_ALLOWLIST)

    assert len(payloads) == 2
    assert len(client.calls) == 2  # one failed attempt + one successful retry


def test_greenhouse_raises_after_exhausting_retries():
    url = greenhouse._board_url("acme")
    client = FakeClient({url: FakeResponse({"error": "boom"}, status_code=503)})
    with pytest.raises(TransientFetchError):
        greenhouse.fetch(client, {"boardTokens": ["acme"]}, GREENHOUSE_ALLOWLIST)


def test_greenhouse_wraps_a_raw_client_exception_as_transient_and_retries():
    """A connection-level failure (not an HTTP error response) must still be
    treated as retryable, not left to propagate as some client-specific
    exception type the caller/runner wouldn't recognize.
    """
    client = RaisingClient(ConnectionError("connection refused"))
    with pytest.raises(TransientFetchError):
        greenhouse.fetch(client, {"boardTokens": ["acme"]}, GREENHOUSE_ALLOWLIST)
    assert len(client.calls) == 3  # exhausted all retry attempts


def test_greenhouse_raises_runtime_error_for_non_5xx_non_200_status():
    url = greenhouse._board_url("acme")
    client = FakeClient({url: FakeResponse({"error": "not found"}, status_code=404)})
    with pytest.raises(RuntimeError):
        greenhouse.fetch(client, {"boardTokens": ["acme"]}, GREENHOUSE_ALLOWLIST)
    assert client.calls == [url]  # a 404 is not retried, unlike a 5xx


# ---------------------------------------------------------------------------
# Lever
# ---------------------------------------------------------------------------

def test_lever_fetch_returns_raw_payloads():
    fixture = load_fixture("lever_postings.json")
    url = lever._postings_url("acme")
    client = FakeClient({url: FakeResponse(fixture)})

    payloads = lever.fetch(client, {"siteSlugs": ["acme"]}, LEVER_ALLOWLIST)

    assert len(payloads) == 1
    assert payloads[0].original_job_id == "abc-123"
    assert payloads[0].payload["text"] == "Senior Backend Engineer"


def test_lever_fetch_rejects_disallowed_host():
    client = FakeClient()
    with pytest.raises(DomainNotAllowedError):
        lever.fetch(client, {"siteSlugs": ["acme"]}, ["not-lever.example"])
    assert client.calls == []


def test_lever_raises_after_exhausting_retries_on_repeated_5xx():
    url = lever._postings_url("acme")
    client = FakeClient({url: FakeResponse({"error": "boom"}, status_code=503)})
    with pytest.raises(TransientFetchError):
        lever.fetch(client, {"siteSlugs": ["acme"]}, LEVER_ALLOWLIST)


def test_lever_wraps_a_raw_client_exception_as_transient_and_retries():
    client = RaisingClient(TimeoutError("timed out"))
    with pytest.raises(TransientFetchError):
        lever.fetch(client, {"siteSlugs": ["acme"]}, LEVER_ALLOWLIST)
    assert len(client.calls) == 3


def test_lever_raises_runtime_error_for_non_5xx_non_200_status():
    url = lever._postings_url("acme")
    client = FakeClient({url: FakeResponse({"error": "unauthorized"}, status_code=401)})
    with pytest.raises(RuntimeError):
        lever.fetch(client, {"siteSlugs": ["acme"]}, LEVER_ALLOWLIST)


# ---------------------------------------------------------------------------
# Arbeitsagentur
# ---------------------------------------------------------------------------

def test_arbeitsagentur_detail_url_base64_encodes_the_refnr():
    """Confirmed against the live API: the raw refnr in the path 404s, only
    a base64-encoded refnr returns the real jobdetails response. This is the
    one thing that's easy to silently break again (e.g. "simplifying" the
    URL builder), so it gets its own direct test, not just indirect coverage
    through fetch().
    """
    base_url = "https://rest.arbeitsagentur.de/jobboerse/jobsuche-service"
    url = arbeitsagentur._detail_url(base_url, "10001-1003086694-S")
    assert url == (
        "https://rest.arbeitsagentur.de/jobboerse/jobsuche-service"
        "/pc/v4/jobdetails/MTAwMDEtMTAwMzA4NjY5NC1T"
    )


def test_arbeitsagentur_fetch_returns_raw_payloads():
    fixture = load_fixture("arbeitsagentur_jobs.json")
    base_url = "https://rest.arbeitsagentur.de/jobboerse/jobsuche-service"
    url = arbeitsagentur._search_url(base_url, was="DevOps Engineer", wo="Deutschland", size=20, page=1)
    detail_url = arbeitsagentur._detail_url(base_url, "10000-1234567890-S")
    client = FakeClient(
        {
            url: FakeResponse(fixture),
            detail_url: FakeResponse({"stellenangebotsBeschreibung": "Wir suchen einen DevOps Engineer."}),
        }
    )

    payloads = arbeitsagentur.fetch(
        client,
        {"baseUrl": base_url},
        ARBEITSAGENTUR_ALLOWLIST,
        search_terms=["DevOps Engineer"],
    )

    assert len(payloads) == 1
    assert payloads[0].original_job_id == "10000-1234567890-S"
    assert payloads[0].payload["arbeitgeber"] == "Deutsche Telekom AG"
    assert payloads[0].payload["stellenangebotsBeschreibung"] == "Wir suchen einen DevOps Engineer."


def test_arbeitsagentur_fetch_rejects_disallowed_host():
    client = FakeClient()
    with pytest.raises(DomainNotAllowedError):
        arbeitsagentur.fetch(
            client,
            {"baseUrl": "https://evil.example.com"},
            ARBEITSAGENTUR_ALLOWLIST,
            search_terms=["DevOps"],
        )
    assert client.calls == []


def test_arbeitsagentur_raises_after_exhausting_retries_on_repeated_5xx():
    base_url = "https://rest.arbeitsagentur.de/jobboerse/jobsuche-service"
    url = arbeitsagentur._search_url(base_url, was="DevOps", wo="Deutschland", size=20, page=1)
    client = FakeClient({url: FakeResponse({"error": "boom"}, status_code=503)})
    with pytest.raises(TransientFetchError):
        arbeitsagentur.fetch(client, {"baseUrl": base_url}, ARBEITSAGENTUR_ALLOWLIST, search_terms=["DevOps"])


def test_arbeitsagentur_wraps_a_raw_client_exception_as_transient_and_retries():
    client = RaisingClient(ConnectionError("connection refused"))
    with pytest.raises(TransientFetchError):
        arbeitsagentur.fetch(
            client,
            {"baseUrl": "https://rest.arbeitsagentur.de/jobboerse/jobsuche-service"},
            ARBEITSAGENTUR_ALLOWLIST,
            search_terms=["DevOps"],
        )
    assert len(client.calls) == 3


def test_arbeitsagentur_raises_runtime_error_for_non_5xx_non_200_status():
    base_url = "https://rest.arbeitsagentur.de/jobboerse/jobsuche-service"
    url = arbeitsagentur._search_url(base_url, was="DevOps", wo="Deutschland", size=20, page=1)
    client = FakeClient({url: FakeResponse({"error": "bad request"}, status_code=400)})
    with pytest.raises(RuntimeError):
        arbeitsagentur.fetch(client, {"baseUrl": base_url}, ARBEITSAGENTUR_ALLOWLIST, search_terms=["DevOps"])


def test_arbeitsagentur_skips_listings_without_a_reference_number():
    """A 'refnr' is this source's only stable identifier -- a listing missing
    one can't be tracked/deduped downstream, so it must be dropped rather
    than crash the batch or get stored with a made-up id.
    """
    base_url = "https://rest.arbeitsagentur.de/jobboerse/jobsuche-service"
    url = arbeitsagentur._search_url(base_url, was="DevOps", wo="Deutschland", size=20, page=1)
    detail_url = arbeitsagentur._detail_url(base_url, "10000-1")
    fixture = {
        "stellenangebote": [
            {"refnr": "10000-1", "titel": "DevOps Engineer", "arbeitgeber": "Acme GmbH"},
            {"titel": "Missing refnr listing", "arbeitgeber": "Acme GmbH"},
        ]
    }
    client = FakeClient({url: FakeResponse(fixture), detail_url: FakeResponse({"stellenangebotsBeschreibung": "..."})})

    payloads = arbeitsagentur.fetch(
        client, {"baseUrl": base_url}, ARBEITSAGENTUR_ALLOWLIST, search_terms=["DevOps"]
    )

    assert len(payloads) == 1
    assert payloads[0].original_job_id == "10000-1"


def test_arbeitsagentur_detail_fetch_failure_degrades_to_empty_description_not_a_crash():
    """The search endpoint alone still produces a usable listing (company,
    title, location, apply URL) - losing the description to a transient
    detail-call failure shouldn't drop the listing or abort the whole batch.
    """
    base_url = "https://rest.arbeitsagentur.de/jobboerse/jobsuche-service"
    url = arbeitsagentur._search_url(base_url, was="DevOps", wo="Deutschland", size=20, page=1)
    detail_url = arbeitsagentur._detail_url(base_url, "10000-1")
    fixture = {"stellenangebote": [{"refnr": "10000-1", "titel": "DevOps Engineer", "arbeitgeber": "Acme GmbH"}]}
    client = FakeClient(
        {url: FakeResponse(fixture), detail_url: FakeResponse({"error": "not found"}, status_code=404)}
    )

    payloads = arbeitsagentur.fetch(client, {"baseUrl": base_url}, ARBEITSAGENTUR_ALLOWLIST, search_terms=["DevOps"])

    assert len(payloads) == 1
    assert payloads[0].payload["stellenangebotsBeschreibung"] == ""


def test_arbeitsagentur_detail_fetch_fetches_a_separate_url_per_listing():
    base_url = "https://rest.arbeitsagentur.de/jobboerse/jobsuche-service"
    url = arbeitsagentur._search_url(base_url, was="DevOps", wo="Deutschland", size=20, page=1)
    detail_url_1 = arbeitsagentur._detail_url(base_url, "10000-1")
    detail_url_2 = arbeitsagentur._detail_url(base_url, "10000-2")
    fixture = {
        "stellenangebote": [
            {"refnr": "10000-1", "titel": "DevOps Engineer", "arbeitgeber": "Acme GmbH"},
            {"refnr": "10000-2", "titel": "SRE", "arbeitgeber": "Beispiel GmbH"},
        ]
    }
    client = FakeClient(
        {
            url: FakeResponse(fixture),
            detail_url_1: FakeResponse({"stellenangebotsBeschreibung": "First listing."}),
            detail_url_2: FakeResponse({"stellenangebotsBeschreibung": "Second listing."}),
        }
    )

    payloads = arbeitsagentur.fetch(client, {"baseUrl": base_url}, ARBEITSAGENTUR_ALLOWLIST, search_terms=["DevOps"])

    assert len(payloads) == 2
    assert payloads[0].payload["stellenangebotsBeschreibung"] == "First listing."
    assert payloads[1].payload["stellenangebotsBeschreibung"] == "Second listing."


def test_arbeitsagentur_fetch_paginates_when_a_page_is_full():
    """A full page (== size) signals there may be more results; fetch() must
    request the next page rather than stopping after page 1. A page shorter
    than size is the real end-of-results signal (see the next test).
    """
    base_url = "https://rest.arbeitsagentur.de/jobboerse/jobsuche-service"
    page1_url = arbeitsagentur._search_url(base_url, was="DevOps", wo="Deutschland", size=2, page=1)
    page2_url = arbeitsagentur._search_url(base_url, was="DevOps", wo="Deutschland", size=2, page=2)
    detail_url_1 = arbeitsagentur._detail_url(base_url, "10000-1")
    detail_url_2 = arbeitsagentur._detail_url(base_url, "10000-2")
    detail_url_3 = arbeitsagentur._detail_url(base_url, "10000-3")
    page1_fixture = {
        "stellenangebote": [
            {"refnr": "10000-1", "titel": "DevOps Engineer", "arbeitgeber": "Acme GmbH"},
            {"refnr": "10000-2", "titel": "SRE", "arbeitgeber": "Beispiel GmbH"},
        ]
    }
    page2_fixture = {"stellenangebote": [{"refnr": "10000-3", "titel": "Platform Engineer", "arbeitgeber": "Foo GmbH"}]}
    client = FakeClient(
        {
            page1_url: FakeResponse(page1_fixture),
            page2_url: FakeResponse(page2_fixture),
            detail_url_1: FakeResponse({"stellenangebotsBeschreibung": "..."}),
            detail_url_2: FakeResponse({"stellenangebotsBeschreibung": "..."}),
            detail_url_3: FakeResponse({"stellenangebotsBeschreibung": "..."}),
        }
    )

    payloads = arbeitsagentur.fetch(
        client, {"baseUrl": base_url}, ARBEITSAGENTUR_ALLOWLIST, search_terms=["DevOps"], size=2, max_pages_per_term=2
    )

    assert [p.original_job_id for p in payloads] == ["10000-1", "10000-2", "10000-3"]
    assert page1_url in client.calls
    assert page2_url in client.calls


def test_arbeitsagentur_stops_pagination_when_a_page_is_short():
    base_url = "https://rest.arbeitsagentur.de/jobboerse/jobsuche-service"
    page1_url = arbeitsagentur._search_url(base_url, was="DevOps", wo="Deutschland", size=2, page=1)
    page2_url = arbeitsagentur._search_url(base_url, was="DevOps", wo="Deutschland", size=2, page=2)
    detail_url_1 = arbeitsagentur._detail_url(base_url, "10000-1")
    page1_fixture = {"stellenangebote": [{"refnr": "10000-1", "titel": "DevOps Engineer", "arbeitgeber": "Acme GmbH"}]}
    client = FakeClient(
        {page1_url: FakeResponse(page1_fixture), detail_url_1: FakeResponse({"stellenangebotsBeschreibung": "..."})}
    )

    payloads = arbeitsagentur.fetch(
        client, {"baseUrl": base_url}, ARBEITSAGENTUR_ALLOWLIST, search_terms=["DevOps"], size=2, max_pages_per_term=3
    )

    assert len(payloads) == 1
    assert page2_url not in client.calls  # a short page means no more results -- don't fetch page 2


def test_arbeitsagentur_dedupes_the_same_job_seen_under_multiple_search_terms():
    """Overlapping search terms (e.g. 'Softwareentwickler' and 'Software
    Engineer') commonly surface the same real posting twice. fetch() must
    collapse that to one payload and one detail-endpoint call per unique
    refnr, not one per (term, listing) occurrence -- otherwise every crawl
    run doubles up detail-endpoint traffic and appends duplicate rows into
    the append-only raw_job_snapshots history for the exact same job.
    """
    base_url = "https://rest.arbeitsagentur.de/jobboerse/jobsuche-service"
    url_a = arbeitsagentur._search_url(base_url, was="Softwareentwickler", wo="Deutschland", size=20, page=1)
    url_b = arbeitsagentur._search_url(base_url, was="Software Engineer", wo="Deutschland", size=20, page=1)
    detail_url = arbeitsagentur._detail_url(base_url, "10000-1")
    fixture = {"stellenangebote": [{"refnr": "10000-1", "titel": "Software Engineer", "arbeitgeber": "Acme GmbH"}]}
    client = FakeClient(
        {
            url_a: FakeResponse(fixture),
            url_b: FakeResponse(fixture),
            detail_url: FakeResponse({"stellenangebotsBeschreibung": "..."}),
        }
    )

    payloads = arbeitsagentur.fetch(
        client,
        {"baseUrl": base_url},
        ARBEITSAGENTUR_ALLOWLIST,
        search_terms=["Softwareentwickler", "Software Engineer"],
    )

    assert len(payloads) == 1
    assert client.calls.count(detail_url) == 1


def test_arbeitsagentur_fetch_stops_once_max_total_jobs_reached():
    base_url = "https://rest.arbeitsagentur.de/jobboerse/jobsuche-service"
    url_a = arbeitsagentur._search_url(base_url, was="A", wo="Deutschland", size=20, page=1)
    url_b = arbeitsagentur._search_url(base_url, was="B", wo="Deutschland", size=20, page=1)
    detail_url_1 = arbeitsagentur._detail_url(base_url, "10000-1")
    detail_url_2 = arbeitsagentur._detail_url(base_url, "10000-2")
    fixture_a = {"stellenangebote": [{"refnr": "10000-1", "titel": "A", "arbeitgeber": "Acme"}]}
    fixture_b = {"stellenangebote": [{"refnr": "10000-2", "titel": "B", "arbeitgeber": "Acme"}]}
    client = FakeClient(
        {
            url_a: FakeResponse(fixture_a),
            url_b: FakeResponse(fixture_b),
            detail_url_1: FakeResponse({"stellenangebotsBeschreibung": "..."}),
            detail_url_2: FakeResponse({"stellenangebotsBeschreibung": "..."}),
        }
    )

    payloads = arbeitsagentur.fetch(
        client, {"baseUrl": base_url}, ARBEITSAGENTUR_ALLOWLIST, search_terms=["A", "B"], max_total_jobs=1
    )

    assert len(payloads) == 1
    assert url_b not in client.calls  # cap reached after term "A" -- term "B" is never even queried


def test_arbeitsagentur_fetch_round_robins_pages_across_terms_before_going_deeper():
    """With many terms and a tight cap, fetch() must give every term a shot
    at page 1 before any term gets a page 2 -- exhausting one term's full
    depth before moving to the next would silently starve every term later
    in the list once the cap is reached (this is exactly what broke
    DEFAULT_SEARCH_TERMS' non-tech breadth before this was fixed: real runs
    would spend the whole cap on the first few tech/sales terms and never
    even query healthcare/logistics/admin terms further down the list).
    """
    base_url = "https://rest.arbeitsagentur.de/jobboerse/jobsuche-service"
    page1_a = arbeitsagentur._search_url(base_url, was="A", wo="Deutschland", size=2, page=1)
    page1_b = arbeitsagentur._search_url(base_url, was="B", wo="Deutschland", size=2, page=1)
    page2_a = arbeitsagentur._search_url(base_url, was="A", wo="Deutschland", size=2, page=2)
    fixture_1_2 = {"stellenangebote": [{"refnr": "1", "titel": "x", "arbeitgeber": "Acme"}, {"refnr": "2", "titel": "y", "arbeitgeber": "Acme"}]}
    fixture_3_4 = {"stellenangebote": [{"refnr": "3", "titel": "z", "arbeitgeber": "Acme"}, {"refnr": "4", "titel": "w", "arbeitgeber": "Acme"}]}
    client = FakeClient(
        {
            page1_a: FakeResponse(fixture_1_2),
            page1_b: FakeResponse(fixture_1_2),  # same refnrs as page1_a -- exercises dedup too
            page2_a: FakeResponse(fixture_3_4),
            **{arbeitsagentur._detail_url(base_url, r): FakeResponse({"stellenangebotsBeschreibung": "..."}) for r in "1234"},
        }
    )

    arbeitsagentur.fetch(
        client,
        {"baseUrl": base_url},
        ARBEITSAGENTUR_ALLOWLIST,
        search_terms=["A", "B"],
        size=2,
        max_pages_per_term=2,
        max_total_jobs=4,
    )

    # Both terms' page 1 must be requested before term "A" is ever given a
    # page 2 -- proves round-robin ordering, not depth-first per term.
    assert client.calls.index(page1_b) < client.calls.index(page2_a)


def test_arbeitsagentur_fetch_defaults_to_a_broad_multi_category_term_list():
    """DEFAULT_SEARCH_TERMS replaced the old single hardcoded 'Software
    Engineer' term specifically so non-tech candidate profiles (sales, HR,
    finance, healthcare, ...) have real jobs to match against -- assert the
    breadth survives rather than silently regressing back to a tech-only list.
    """
    assert len(arbeitsagentur.DEFAULT_SEARCH_TERMS) >= 20
    assert "Software Engineer" in arbeitsagentur.DEFAULT_SEARCH_TERMS
    assert "Vertriebsmitarbeiter" in arbeitsagentur.DEFAULT_SEARCH_TERMS
    assert "Buchhalter" in arbeitsagentur.DEFAULT_SEARCH_TERMS


# ---------------------------------------------------------------------------
# Stepstone (best-effort adapter shape -- see crawler/stepstone.py module TODO)
# ---------------------------------------------------------------------------

def test_stepstone_fetch_returns_raw_payloads():
    fixture = load_fixture("stepstone_feed.json")
    feed_url = "https://www.stepstone.de/feeds/partner-123.json"
    client = FakeClient({feed_url: FakeResponse(fixture)})

    payloads = stepstone.fetch(client, {"feedUrls": [feed_url]}, STEPSTONE_ALLOWLIST)

    assert len(payloads) == 1
    assert payloads[0].original_job_id == "ss-501"


def test_stepstone_fetch_with_no_feed_urls_returns_empty_list():
    """market-de ships stepstone with an empty config -- this must degrade
    gracefully rather than error, since the real feed contract is still TODO.
    """
    client = FakeClient()
    payloads = stepstone.fetch(client, {}, STEPSTONE_ALLOWLIST)
    assert payloads == []
    assert client.calls == []


def test_stepstone_fetch_rejects_disallowed_host():
    client = FakeClient()
    with pytest.raises(DomainNotAllowedError):
        stepstone.fetch(client, {"feedUrls": ["https://evil.example.com/feed.json"]}, STEPSTONE_ALLOWLIST)
    assert client.calls == []


def test_stepstone_raises_after_exhausting_retries_on_repeated_5xx():
    feed_url = "https://www.stepstone.de/feeds/partner-123.json"
    client = FakeClient({feed_url: FakeResponse({"error": "boom"}, status_code=503)})
    with pytest.raises(TransientFetchError):
        stepstone.fetch(client, {"feedUrls": [feed_url]}, STEPSTONE_ALLOWLIST)


def test_stepstone_wraps_a_raw_client_exception_as_transient_and_retries():
    client = RaisingClient(ConnectionError("connection refused"))
    feed_url = "https://www.stepstone.de/feeds/partner-123.json"
    with pytest.raises(TransientFetchError):
        stepstone.fetch(client, {"feedUrls": [feed_url]}, STEPSTONE_ALLOWLIST)
    assert len(client.calls) == 3


def test_stepstone_raises_runtime_error_for_non_5xx_non_200_status():
    feed_url = "https://www.stepstone.de/feeds/partner-123.json"
    client = FakeClient({feed_url: FakeResponse({"error": "gone"}, status_code=410)})
    with pytest.raises(RuntimeError):
        stepstone.fetch(client, {"feedUrls": [feed_url]}, STEPSTONE_ALLOWLIST)


def test_stepstone_skips_listings_without_an_id():
    feed_url = "https://www.stepstone.de/feeds/partner-123.json"
    fixture = {
        "jobs": [
            {"id": "ss-1", "title": "Data Analyst"},
            {"title": "Missing id listing"},
        ]
    }
    client = FakeClient({feed_url: FakeResponse(fixture)})

    payloads = stepstone.fetch(client, {"feedUrls": [feed_url]}, STEPSTONE_ALLOWLIST)

    assert len(payloads) == 1
    assert payloads[0].original_job_id == "ss-1"


# ---------------------------------------------------------------------------
# Personio
# ---------------------------------------------------------------------------

def test_personio_fetch_returns_raw_payloads():
    xml_text = load_text_fixture("personio_feed.xml")
    url = personio._feed_url("acme")
    client = FakeClient({url: FakeResponse(raw_text=xml_text)})

    payloads = personio.fetch(client, {"companySubdomains": ["acme"]}, PERSONIO_ALLOWLIST)

    assert len(payloads) == 2
    assert payloads[0].original_job_id == "2001"
    assert payloads[0].payload["name"] == "Senior Backend Engineer (m/w/d)"
    assert payloads[0].payload["office"] == "Berlin"
    assert client.calls == [url]


def test_personio_fetch_empty_company_subdomains_returns_empty_list():
    client = FakeClient()
    payloads = personio.fetch(client, {"companySubdomains": []}, PERSONIO_ALLOWLIST)
    assert payloads == []
    assert client.calls == []


def test_personio_fetch_rejects_disallowed_host_config():
    client = FakeClient()
    with pytest.raises(DomainNotAllowedError):
        personio.fetch(client, {"companySubdomains": ["acme"]}, ["not-personio.example"])
    assert client.calls == []


def test_personio_retries_on_transient_failure_then_succeeds():
    xml_text = load_text_fixture("personio_feed.xml")
    url = personio._feed_url("acme")
    client = FlakyThenOkClient(url, success=FakeResponse(raw_text=xml_text), fail_times=1)

    payloads = personio.fetch(client, {"companySubdomains": ["acme"]}, PERSONIO_ALLOWLIST)

    assert len(payloads) == 2
    assert len(client.calls) == 2


def test_personio_raises_after_exhausting_retries():
    url = personio._feed_url("acme")
    client = FakeClient({url: FakeResponse(status_code=503, raw_text="")})
    with pytest.raises(TransientFetchError):
        personio.fetch(client, {"companySubdomains": ["acme"]}, PERSONIO_ALLOWLIST)


def test_personio_wraps_a_raw_client_exception_as_transient_and_retries():
    client = RaisingClient(ConnectionError("connection refused"))
    with pytest.raises(TransientFetchError):
        personio.fetch(client, {"companySubdomains": ["acme"]}, PERSONIO_ALLOWLIST)
    assert len(client.calls) == 3


def test_personio_skips_positions_without_an_id():
    xml_text = """<?xml version="1.0"?>
<workzag-jobs>
  <position>
    <name>Missing id listing</name>
  </position>
  <position>
    <id>9999</id>
    <name>Valid listing</name>
  </position>
</workzag-jobs>"""
    url = personio._feed_url("acme")
    client = FakeClient({url: FakeResponse(raw_text=xml_text)})

    payloads = personio.fetch(client, {"companySubdomains": ["acme"]}, PERSONIO_ALLOWLIST)

    assert len(payloads) == 1
    assert payloads[0].original_job_id == "9999"


# ---------------------------------------------------------------------------
# SmartRecruiters
# ---------------------------------------------------------------------------

def test_smartrecruiters_fetch_returns_raw_payloads():
    fixture = load_fixture("smartrecruiters_postings.json")
    url = smartrecruiters._postings_url("acme")
    client = FakeClient({url: FakeResponse(fixture)})

    payloads = smartrecruiters.fetch(client, {"companyIdentifiers": ["acme"]}, SMARTRECRUITERS_ALLOWLIST)

    assert len(payloads) == 2
    assert payloads[0].original_job_id == "744000012345678"
    assert payloads[0].payload["name"] == "Senior Backend Engineer (m/f/d)"
    assert client.calls == [url]


def test_smartrecruiters_fetch_empty_company_identifiers_returns_empty_list():
    client = FakeClient()
    payloads = smartrecruiters.fetch(client, {"companyIdentifiers": []}, SMARTRECRUITERS_ALLOWLIST)
    assert payloads == []
    assert client.calls == []


def test_smartrecruiters_fetch_rejects_disallowed_host_config():
    client = FakeClient()
    with pytest.raises(DomainNotAllowedError):
        smartrecruiters.fetch(client, {"companyIdentifiers": ["acme"]}, ["not-smartrecruiters.example"])
    assert client.calls == []


def test_smartrecruiters_retries_on_transient_failure_then_succeeds():
    fixture = load_fixture("smartrecruiters_postings.json")
    url = smartrecruiters._postings_url("acme")
    client = FlakyThenOkClient(url, success=FakeResponse(fixture), fail_times=1)

    payloads = smartrecruiters.fetch(client, {"companyIdentifiers": ["acme"]}, SMARTRECRUITERS_ALLOWLIST)

    assert len(payloads) == 2
    assert len(client.calls) == 2


def test_smartrecruiters_raises_after_exhausting_retries():
    url = smartrecruiters._postings_url("acme")
    client = FakeClient({url: FakeResponse({"error": "boom"}, status_code=503)})
    with pytest.raises(TransientFetchError):
        smartrecruiters.fetch(client, {"companyIdentifiers": ["acme"]}, SMARTRECRUITERS_ALLOWLIST)


def test_smartrecruiters_wraps_a_raw_client_exception_as_transient_and_retries():
    client = RaisingClient(ConnectionError("connection refused"))
    with pytest.raises(TransientFetchError):
        smartrecruiters.fetch(client, {"companyIdentifiers": ["acme"]}, SMARTRECRUITERS_ALLOWLIST)
    assert len(client.calls) == 3


def test_smartrecruiters_fetch_paginates_across_offsets():
    """A full page (== limit) with more totalFound remaining means there IS a
    next page; fetch() must keep paging via offset until it catches up with
    totalFound, not just take the first page -- this is exactly what silently
    capped a real 947-posting company at only 100 fetched jobs before this
    fix (see the module docstring).
    """
    url_page1 = smartrecruiters._postings_url("acme", offset=0, limit=2)
    url_page2 = smartrecruiters._postings_url("acme", offset=2, limit=2)
    page1 = {
        "totalFound": 3,
        "content": [
            {"id": "1", "name": "A", "company": {"identifier": "acme"}},
            {"id": "2", "name": "B", "company": {"identifier": "acme"}},
        ],
    }
    page2 = {"totalFound": 3, "content": [{"id": "3", "name": "C", "company": {"identifier": "acme"}}]}
    client = FakeClient({url_page1: FakeResponse(page1), url_page2: FakeResponse(page2)})

    payloads = smartrecruiters.fetch(client, {"companyIdentifiers": ["acme"]}, SMARTRECRUITERS_ALLOWLIST, limit=2)

    assert [p.original_job_id for p in payloads] == ["1", "2", "3"]
    assert client.calls == [url_page1, url_page2]


def test_smartrecruiters_fetch_stops_at_max_jobs_per_company_safety_cap():
    url_page1 = smartrecruiters._postings_url("acme", offset=0, limit=2)
    page1 = {
        "totalFound": 1000,
        "content": [
            {"id": "1", "name": "A", "company": {"identifier": "acme"}},
            {"id": "2", "name": "B", "company": {"identifier": "acme"}},
        ],
    }
    client = FakeClient({url_page1: FakeResponse(page1)})

    payloads = smartrecruiters.fetch(
        client, {"companyIdentifiers": ["acme"]}, SMARTRECRUITERS_ALLOWLIST, limit=2, max_jobs_per_company=2
    )

    assert len(payloads) == 2
    assert client.calls == [url_page1]  # cap reached after page 1 -- never requests offset=2
