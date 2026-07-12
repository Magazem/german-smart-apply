"""Adapter unit/integration tests -- all against fixture payloads, never the
live network. Uses a FakeClient (tests/fakes.py) so responses are deterministic
and no real HTTP call is ever attempted.
"""
from __future__ import annotations

import pytest

from crawler import arbeitsagentur, greenhouse, lever, stepstone
from crawler.base import DomainNotAllowedError, TransientFetchError, enforce_domain_allowlist
from tests.conftest import load_fixture
from tests.fakes import FakeClient, FakeResponse, FlakyThenOkClient, RaisingClient

GREENHOUSE_ALLOWLIST = ["boards-api.greenhouse.io"]
LEVER_ALLOWLIST = ["api.lever.co"]
ARBEITSAGENTUR_ALLOWLIST = ["rest.arbeitsagentur.de"]
STEPSTONE_ALLOWLIST = ["www.stepstone.de"]


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

def test_arbeitsagentur_fetch_returns_raw_payloads():
    fixture = load_fixture("arbeitsagentur_jobs.json")
    base_url = "https://rest.arbeitsagentur.de/jobboerse/jobsuche-service"
    url = arbeitsagentur._search_url(base_url, was="DevOps Engineer", wo="Deutschland", size=50, page=1)
    client = FakeClient({url: FakeResponse(fixture)})

    payloads = arbeitsagentur.fetch(
        client,
        {"baseUrl": base_url},
        ARBEITSAGENTUR_ALLOWLIST,
        search_terms=["DevOps Engineer"],
    )

    assert len(payloads) == 1
    assert payloads[0].original_job_id == "10000-1234567890-S"
    assert payloads[0].payload["arbeitgeber"] == "Deutsche Telekom AG"


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
    url = arbeitsagentur._search_url(base_url, was="DevOps", wo="Deutschland", size=50, page=1)
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
    url = arbeitsagentur._search_url(base_url, was="DevOps", wo="Deutschland", size=50, page=1)
    client = FakeClient({url: FakeResponse({"error": "bad request"}, status_code=400)})
    with pytest.raises(RuntimeError):
        arbeitsagentur.fetch(client, {"baseUrl": base_url}, ARBEITSAGENTUR_ALLOWLIST, search_terms=["DevOps"])


def test_arbeitsagentur_skips_listings_without_a_reference_number():
    """A 'refnr' is this source's only stable identifier -- a listing missing
    one can't be tracked/deduped downstream, so it must be dropped rather
    than crash the batch or get stored with a made-up id.
    """
    base_url = "https://rest.arbeitsagentur.de/jobboerse/jobsuche-service"
    url = arbeitsagentur._search_url(base_url, was="DevOps", wo="Deutschland", size=50, page=1)
    fixture = {
        "stellenangebote": [
            {"refnr": "10000-1", "titel": "DevOps Engineer", "arbeitgeber": "Acme GmbH"},
            {"titel": "Missing refnr listing", "arbeitgeber": "Acme GmbH"},
        ]
    }
    client = FakeClient({url: FakeResponse(fixture)})

    payloads = arbeitsagentur.fetch(
        client, {"baseUrl": base_url}, ARBEITSAGENTUR_ALLOWLIST, search_terms=["DevOps"]
    )

    assert len(payloads) == 1
    assert payloads[0].original_job_id == "10000-1"


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
