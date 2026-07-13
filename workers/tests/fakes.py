"""Fake HTTP client for crawler adapter tests that don't use `responses`.

Satisfies crawler.base.HttpClient's protocol (a `.get(url, params=None,
headers=None, timeout=...)` method returning an object with `.status_code`
and `.json()`), so adapters under test never know they're not talking to a
real `requests.Session`.
"""
from __future__ import annotations

import json as json_module


class FakeResponse:
    """Wraps either JSON (the common case) or raw text (e.g. XML feeds like
    Personio's) -- pass `raw_text` for adapters that read `.text` directly
    instead of calling `.json()`.
    """

    def __init__(self, json_data=None, status_code: int = 200, raw_text: str | None = None):
        self._json = json_data
        self._raw_text = raw_text
        self.status_code = status_code

    def json(self):
        return self._json

    @property
    def text(self) -> str:
        if self._raw_text is not None:
            return self._raw_text
        return json_module.dumps(self._json)


class FakeClient:
    """Maps exact URLs to canned FakeResponses. Records every call made so
    tests can assert a URL was (or was never) requested -- e.g. to prove the
    domain allowlist guard fired before any network call.
    """

    def __init__(self, responses_by_url: dict[str, FakeResponse] | None = None, default: FakeResponse | None = None):
        self.responses_by_url = responses_by_url or {}
        self.default = default
        self.calls: list[str] = []

    def get(self, url: str, params=None, headers=None, timeout: float = 10.0):
        self.calls.append(url)
        if url in self.responses_by_url:
            return self.responses_by_url[url]
        if self.default is not None:
            return self.default
        raise AssertionError(f"FakeClient received an unexpected URL: {url}")


class RaisingClient:
    """Raises a plain exception from every .get() call -- simulates a
    network-level failure (DNS, connection refused, timeout) as opposed to
    FakeResponse's HTTP-level error statuses. Used to prove adapters wrap
    *any* client exception into TransientFetchError, not just bad status
    codes, so the shared retry policy actually applies to it.
    """

    def __init__(self, exc: BaseException | None = None):
        self.exc = exc or ConnectionError("connection refused")
        self.calls: list[str] = []

    def get(self, url: str, params=None, headers=None, timeout: float = 10.0):
        self.calls.append(url)
        raise self.exc


class FlakyThenOkClient:
    """Fails with a 500 the first N times a given URL is requested, then
    returns the canned success response -- used to test retry/backoff.
    """

    def __init__(self, url: str, success: FakeResponse, fail_times: int = 1):
        self.url = url
        self.success = success
        self.fail_times = fail_times
        self.calls: list[str] = []

    def get(self, url: str, params=None, headers=None, timeout: float = 10.0):
        self.calls.append(url)
        if url == self.url and len(self.calls) <= self.fail_times:
            return FakeResponse({"error": "boom"}, status_code=503)
        return self.success
