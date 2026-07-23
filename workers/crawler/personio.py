"""Personio recruiting XML feed adapter.

Personio (a German HR/ATS company) exposes a public, per-company XML job feed
that a company must explicitly enable in its Personio account settings:

  GET https://{company_subdomain}.jobs.personio.de/xml

Response shape (subset we care about, per Personio's published feed format):
<?xml version="1.0" encoding="UTF-8"?>
<workzag-jobs>
  <position>
    <id>1234567</id>
    <name>Senior Backend Engineer (m/w/d)</name>
    <office>Berlin</office>
    <department>Engineering</department>
    <employmentType>Permanent Employee</employmentType>
    <seniority>Experienced</seniority>
    <schedule>Full-time</schedule>
    <recruitingCategory>IT</recruitingCategory>
    <occupationCategory>...</occupationCategory>
    <createdAt>2026-06-01T10:00:00Z</createdAt>
    <jobDescriptions>
      <jobDescription>
        <name>Qualifications</name>
        <value><![CDATA[<p>...</p>]]></value>
      </jobDescription>
    </jobDescriptions>
  </position>
  ...
</workzag-jobs>

Note: this adapter is built against Personio's documented/observed public feed
element names (root <workzag-jobs>, per-job <position>). Personio does not
publish this as a single stable versioned API spec the way Greenhouse/Lever do
their JSON APIs -- exact tag availability can vary slightly by account/plan,
so treat the tag names here as "best-effort, verify against one real
company's live feed before enabling in production", the same posture already
taken for stepstone.py's assumed feed shape.

`config.companySubdomains` (list[str]) lists the Personio company subdomains
(one per company) this source should crawl. Starts empty in market-de.
"""
from __future__ import annotations

from xml.etree import ElementTree

from crawler.base import HttpClient, RawPayload, TransientFetchError, enforce_domain_allowlist, retryable

HOST_SUFFIX = ".jobs.personio.de"


def _feed_url(company_subdomain: str) -> str:
    return f"https://{company_subdomain}{HOST_SUFFIX}/xml"


@retryable()
def _get(client: HttpClient, url: str) -> bytes:
    """Returns the *undecoded* response body.

    Deliberately `.content`, never `.text`: Personio serves this feed as
    `Content-Type: text/xml` with no charset parameter, and `requests`
    defaults any charset-less `text/*` response to ISO-8859-1. Reading
    `.text` therefore decoded the feed's UTF-8 bytes as Latin-1 and turned
    every German umlaut into mojibake ("fuehrenden" -> "fÃ¼hrenden"), which
    then flowed through the snapshot and into the rendered job description.
    Live-verified against candis/clark's real feeds on 2026-07-23.

    Handing raw bytes to ElementTree is also the *correct* fix rather than
    just hard-coding utf-8: the feed opens with `<?xml version="1.0"
    encoding="UTF-8"?>`, and an XML parser given bytes honours that
    declaration, so a company whose feed ever declares something else still
    decodes correctly. (Passing an already-decoded `str` containing an
    encoding declaration is what XML parsers reject/ignore.)
    """
    try:
        resp = client.get(url, timeout=10.0)
    except Exception as exc:  # noqa: BLE001 - network errors of any kind are transient
        raise TransientFetchError(str(exc)) from exc
    if resp.status_code >= 500:
        raise TransientFetchError(f"Personio returned {resp.status_code} for {url}")
    if resp.status_code != 200:
        raise RuntimeError(f"Personio returned {resp.status_code} for {url}")
    return resp.content


def _position_to_dict(position: ElementTree.Element, company_subdomain: str) -> dict:
    def text_of(tag: str) -> str | None:
        el = position.find(tag)
        return el.text if el is not None else None

    descriptions = {}
    for desc in position.findall("./jobDescriptions/jobDescription"):
        name_el = desc.find("name")
        value_el = desc.find("value")
        if name_el is not None and value_el is not None:
            descriptions[name_el.text or ""] = value_el.text or ""

    return {
        "id": text_of("id"),
        "name": text_of("name"),
        "office": text_of("office"),
        "department": text_of("department"),
        "employmentType": text_of("employmentType"),
        "schedule": text_of("schedule"),
        "createdAt": text_of("createdAt"),
        "descriptions": descriptions,
        "_company_subdomain": company_subdomain,
    }


def fetch(client: HttpClient, config: dict, domain_allowlist: list[str]) -> list[RawPayload]:
    """Fetch all jobs for every Personio company subdomain configured for this source."""
    company_subdomains: list[str] = config.get("companySubdomains", [])
    payloads: list[RawPayload] = []

    for subdomain in company_subdomains:
        url = _feed_url(subdomain)
        enforce_domain_allowlist(url, domain_allowlist)
        xml_bytes = _get(client, url)
        root = ElementTree.fromstring(xml_bytes)
        for position in root.findall("./position"):
            job = _position_to_dict(position, subdomain)
            if not job["id"]:
                continue
            payloads.append(
                RawPayload(
                    original_job_id=str(job["id"]),
                    payload=job,
                    fetched_at=RawPayload.now_iso(),
                )
            )
    return payloads


# Note: mapping this raw Personio payload shape to the pipeline's common
# intermediate fields is a normalization concern -- see
# normalizer/extractors.py:extract_personio.
