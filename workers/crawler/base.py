"""Shared crawler primitives: domain allowlist guard, retry policy, HTTP client
protocol, and the RawPayload shape every adapter returns.
"""
from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any, Protocol
from urllib.parse import urlparse

from tenacity import retry, retry_if_exception_type, stop_after_attempt, wait_exponential


class DomainNotAllowedError(Exception):
    """Raised when an adapter tries to fetch a URL whose host is not on the
    source's domain allowlist. This is a governance/SSRF guard, not decorative:
    it must be checked before any network call is made.
    """


class TransientFetchError(Exception):
    """Raised by adapters/clients for retryable failures (timeouts, 5xx, etc).
    Adapters should catch lower-level client errors and re-raise as this so the
    shared retry policy in `retryable` can apply uniformly.
    """


def enforce_domain_allowlist(url: str, allowlist: list[str]) -> None:
    """Raise DomainNotAllowedError if `url`'s host is not exactly one of the
    allowlisted hosts for this source. Must be called before every fetch.
    """
    host = urlparse(url).hostname
    if not host or host.lower() not in {h.lower() for h in allowlist}:
        raise DomainNotAllowedError(
            f"Refusing to fetch {url!r}: host {host!r} is not in the source's "
            f"domain allowlist {allowlist!r}"
        )


# Shared retry/backoff policy: exponential backoff, small number of attempts.
# Adapters wrap only the actual network call with this decorator so a single
# transient failure doesn't kill an entire crawl run.
def retryable(max_attempts: int = 3):
    return retry(
        reraise=True,
        stop=stop_after_attempt(max_attempts),
        wait=wait_exponential(multiplier=0.1, min=0.1, max=2),
        retry=retry_if_exception_type(TransientFetchError),
    )


class HttpResponse(Protocol):
    status_code: int

    def json(self) -> Any: ...
    @property
    def text(self) -> str: ...
    # Undecoded response body. Adapters parsing a *document* format that
    # declares its own encoding (XML, HTML) must read this rather than
    # `.text`: `requests` defaults to ISO-8859-1 for any `text/*` response
    # that omits a charset in Content-Type, which silently mojibake-decodes
    # UTF-8 feeds (see personio.py's `_get`).
    @property
    def content(self) -> bytes: ...


class HttpClient(Protocol):
    """Minimal interface adapters need. `requests.Session` satisfies this
    naturally; tests inject a fake implementing the same shape (see
    tests/fakes.py) so no adapter test ever touches the network.
    """

    def get(self, url: str, params: dict | None = None, headers: dict | None = None, timeout: float = 10.0) -> HttpResponse: ...


@dataclass
class RawPayload:
    """What every adapter hands back per job listing, ready to be persisted
    into raw_job_snapshots (sourceId is attached by the runner, not the adapter).
    """

    original_job_id: str
    payload: dict
    fetched_at: str

    @staticmethod
    def now_iso() -> str:
        return datetime.now(timezone.utc).isoformat()
