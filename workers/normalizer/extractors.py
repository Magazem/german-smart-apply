"""Per-sourceType payload extractors.

Each function maps one source's raw JSON payload shape (as returned by the
matching crawler adapter, and as stored verbatim in raw_job_snapshots.payload)
into the pipeline's common intermediate shape:

    {
        "original_job_id": str,
        "company_name_raw": str,
        "job_title_raw": str,
        "description_html": str | None,
        "description_text": str,
        "location_raw": str,
        "source_url": str,
        "apply_url": str,
        "posted_at": str | None,       # raw date string, parsed later
        "employment_type_hint": str | None,
        "remote_hint": bool | str | None,
    }

This is deliberately kept separate from field-level normalization (fields.py):
extraction is about "where does the title live in this JSON shape", while
normalization is about "how do we standardize a title/location/salary value
regardless of source".
"""
from __future__ import annotations

import html
import re
from datetime import datetime, timezone

# Block-level tags whose opening/closing boundaries mark a paragraph, line, or
# list-item break. Matched case-insensitively and replaced with a newline
# BEFORE remaining (inline) tags are stripped to spaces, so the structure
# these tags encode survives into the plain-text fallback instead of every
# tag boundary collapsing into a single run-on string.
_BLOCK_TAG_RE = re.compile(
    r"</?(?:p|div|br|li|h[1-6]|ul|ol|blockquote)\b[^>]*>",
    re.IGNORECASE,
)

# Elements whose *contents* are not prose and must be dropped wholesale rather
# than merely untagged -- otherwise CSS rules and JS source leak into the
# plain-text description as body copy.
_VOID_CONTENT_ELEMENT_RE = re.compile(
    r"<(script|style|noscript)\b[^>]*>.*?</\1\s*>",
    re.IGNORECASE | re.DOTALL,
)

_HTML_COMMENT_RE = re.compile(r"<!--.*?-->", re.DOTALL)

# Structural/inline tags worth keeping in the stored description HTML. Source
# ATS payloads also carry presentational and embedded content (inline
# `style="font-family:Arial..."`, `<img>` tracking pixels, `<iframe>`s) that
# either fights the site's own typography or has no business in a job
# description.
_ALLOWED_TAGS = frozenset(
    {
        "p", "br", "hr", "div", "span",
        "ul", "ol", "li", "dl", "dt", "dd",
        "h1", "h2", "h3", "h4", "h5", "h6",
        "strong", "b", "em", "i", "u", "sub", "sup", "small",
        "blockquote", "pre", "code",
        "table", "thead", "tbody", "tr", "th", "td",
        "a",
    }
)

# Attributes kept on surviving tags. Everything else -- `style`, `class`,
# `id`, every `on*` handler, `srcset`, framework data-attrs -- is dropped.
_ALLOWED_ATTRS = {"a": {"href", "title"}}

_TAG_RE = re.compile(r"<(/?)([a-zA-Z][a-zA-Z0-9]*)\b([^>]*?)(/?)>")
_ATTR_RE = re.compile(r"""([a-zA-Z_:][-a-zA-Z0-9_:.]*)\s*=\s*("[^"]*"|'[^']*'|[^\s"'>]+)""")
_UNSAFE_URL_RE = re.compile(r"^\s*(?:javascript|vbscript|data)\s*:", re.IGNORECASE)


def _clean_attrs(tag: str, attr_blob: str) -> str:
    allowed = _ALLOWED_ATTRS.get(tag)
    if not allowed:
        return ""
    kept = []
    for name, value in _ATTR_RE.findall(attr_blob):
        if name.lower() not in allowed:
            continue
        unquoted = value[1:-1] if value[:1] in {'"', "'"} else value
        if name.lower() == "href" and _UNSAFE_URL_RE.match(html.unescape(unquoted)):
            continue
        kept.append(f'{name.lower()}="{unquoted}"')
    return (" " + " ".join(kept)) if kept else ""


def _sanitize_html(raw_html: str) -> str:
    """Reduce a source ATS's description HTML to a safe, presentation-neutral
    subset before it is stored in raw_jobs.jobDescriptionHtml (which the job
    detail page renders).

    This is a tag/attribute allowlist over the markup these APIs actually
    emit, not a general-purpose HTML parser -- it is deliberately the *first*
    of two layers, not the only one: the web app still runs the stored HTML
    through DOMPurify at render time (see jobs/[id]/page.tsx), which remains
    the security boundary. What this pass adds is (a) removing script/style
    bodies and embedded content before they are ever persisted, and (b)
    stripping inline presentation so descriptions inherit the site's own
    typography instead of a random `font-family:Arial;font-size:14px` from
    whoever pasted the posting into their ATS.
    """
    text = raw_html or ""
    text = _VOID_CONTENT_ELEMENT_RE.sub("", text)
    text = _HTML_COMMENT_RE.sub("", text)

    def replace(match: re.Match) -> str:
        closing, tag, attr_blob, self_closing = match.groups()
        tag = tag.lower()
        if tag not in _ALLOWED_TAGS:
            return ""
        if closing:
            return f"</{tag}>"
        return f"<{tag}{_clean_attrs(tag, attr_blob)}{'/' if self_closing else ''}>"

    return _TAG_RE.sub(replace, text).strip()


def _strip_html(raw_html: str) -> str:
    text = raw_html or ""
    # Drop non-prose element bodies first; the generic tag strip below would
    # otherwise untag them and leave their CSS/JS source in the text.
    text = _VOID_CONTENT_ELEMENT_RE.sub("", text)
    text = _HTML_COMMENT_RE.sub("", text)
    text = _BLOCK_TAG_RE.sub("\n", text)
    text = re.sub(r"<[^>]+>", " ", text)
    # Decode entities (e.g. "&amp;", or an already-escaped "&lt;/h2&gt;")
    # after tag removal, so escaped text renders as real characters instead
    # of passing through untouched to the page.
    text = html.unescape(text)
    # `&nbsp;` decodes to U+00A0, which the horizontal-whitespace collapse
    # below does not match -- leaving stray non-breaking spaces stranded at
    # line ends (Greenhouse postings alone carry ~20 per description). Fold
    # them into ordinary spaces so the collapse/trim steps can see them.
    text = text.replace("\xa0", " ")
    # Collapse only repeated horizontal whitespace -- newlines inserted above
    # are the paragraph/line-break structure and must survive, unlike the
    # old blanket "\s+" collapse which erased them entirely.
    text = re.sub(r"[ \t]+", " ", text)
    # Trim horizontal whitespace hugging a newline (left behind e.g. between
    # a stripped inline tag and an adjacent block-tag newline).
    text = re.sub(r"[ \t]*\n[ \t]*", "\n", text)
    # Cap blank-line runs at a single blank line between paragraphs so it
    # doesn't look excessively spaced.
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip()


def extract_greenhouse(payload: dict) -> dict:
    location = payload.get("location") or {}
    content = payload.get("content")
    # Greenhouse's Job Board API returns `content` HTML-entity-escaped exactly
    # once -- the wire value literally starts "&lt;h2&gt;&lt;strong&gt;" and an
    # ampersand that was `&nbsp;` in the posting arrives as `&amp;nbsp;`
    # (live-verified against boards-api.greenhouse.io on 2026-07-23). Storing
    # that string as description_html meant the job page rendered the escaped
    # text verbatim, so readers saw literal "<h1>" / "&amp;" instead of a
    # heading and an "&". Unescaping exactly once -- not to a fixpoint, which
    # would over-decode `&amp;nbsp;` past its intended `&nbsp;` -- recovers the
    # real HTML the posting was written in.
    content_html = html.unescape(content) if content else content
    return {
        "original_job_id": str(payload["id"]),
        "company_name_raw": payload.get("company_name") or payload.get("_board_token", "Unknown"),
        "job_title_raw": payload.get("title", ""),
        "description_html": _sanitize_html(content_html) or None,
        "description_text": _strip_html(content_html or ""),
        "location_raw": location.get("name", ""),
        "source_url": payload.get("absolute_url", ""),
        "apply_url": payload.get("absolute_url", ""),
        "posted_at": payload.get("updated_at"),
        "employment_type_hint": None,
        "remote_hint": None,
    }


def extract_lever(payload: dict) -> dict:
    categories = payload.get("categories") or {}
    posted_at = None
    created_at = payload.get("createdAt")
    if isinstance(created_at, (int, float)):
        posted_at = datetime.fromtimestamp(created_at / 1000, tz=timezone.utc).isoformat()

    return {
        "original_job_id": str(payload["id"]),
        "company_name_raw": payload.get("_site_slug", "Unknown"),
        "job_title_raw": payload.get("text", ""),
        "description_html": _sanitize_html(payload.get("description") or "") or None,
        "description_text": payload.get("descriptionPlain") or _strip_html(payload.get("description") or ""),
        "location_raw": categories.get("location", ""),
        "source_url": payload.get("hostedUrl", ""),
        "apply_url": payload.get("applyUrl") or payload.get("hostedUrl", ""),
        "posted_at": posted_at,
        "employment_type_hint": categories.get("commitment"),
        "remote_hint": None,
    }


def extract_arbeitsagentur(payload: dict) -> dict:
    arbeitsort = payload.get("arbeitsort") or {}
    location_parts = [p for p in [arbeitsort.get("ort"), arbeitsort.get("region")] if p]
    location_raw = ", ".join(location_parts) if location_parts else arbeitsort.get("ort", "")

    external_url = payload.get("externeUrl")
    detail_url = f"https://www.arbeitsagentur.de/jobsuche/jobdetail/{payload.get('refnr', '')}"

    return {
        "original_job_id": str(payload.get("refnr", "")),
        "company_name_raw": payload.get("arbeitgeber", "Unknown"),
        "job_title_raw": payload.get("titel", ""),
        "description_html": None,
        "description_text": payload.get("stellenangebotsBeschreibung", "") or "",
        "location_raw": location_raw,
        # Unlike every other source (where source_url === apply_url, the ATS
        # page serves both purposes), Arbeitsagentur's own detail page is
        # never where you actually submit an application - "apply" always
        # goes to the employer's original external posting when one exists.
        # So apply_url is the BA detail page (what the "Apply on
        # Arbeitsagentur" button should open) and source_url is the external
        # original listing (what "View original listing" should open).
        "source_url": external_url or detail_url,
        "apply_url": detail_url,
        "posted_at": payload.get("aktuelleVeroeffentlichungsdatum") or payload.get("eintrittsdatum"),
        "employment_type_hint": None,
        "remote_hint": None,
    }


def extract_personio(payload: dict) -> dict:
    descriptions: dict = payload.get("descriptions") or {}
    description_html = "".join(
        f"<h3>{html.escape(name or '')}</h3>{value or ''}"
        for name, value in descriptions.items()
        if value
    )
    subdomain = payload.get("_company_subdomain", "")

    return {
        "original_job_id": str(payload["id"]),
        "company_name_raw": subdomain or "Unknown",
        "job_title_raw": payload.get("name", ""),
        "description_html": _sanitize_html(description_html) or None,
        "description_text": _strip_html(description_html),
        "location_raw": payload.get("office", ""),
        "source_url": f"https://{subdomain}.jobs.personio.de/job/{payload['id']}",
        "apply_url": f"https://{subdomain}.jobs.personio.de/job/{payload['id']}",
        "posted_at": payload.get("createdAt"),
        "employment_type_hint": payload.get("employmentType") or payload.get("schedule"),
        "remote_hint": None,
    }


def extract_smartrecruiters(payload: dict) -> dict:
    company = payload.get("company") or {}
    location = payload.get("location") or {}
    department = payload.get("department") or {}
    employment = payload.get("typeOfEmployment") or {}
    # `jobAd` is populated by the crawler's per-posting detail call, not by the
    # postings list response -- see crawler/smartrecruiters.py. A section with
    # no body is skipped entirely rather than emitting a bare heading, since
    # SmartRecruiters returns the full four-section skeleton even when a
    # company left some of it blank.
    sections = ((payload.get("jobAd") or {}).get("sections")) or {}
    description_html = "".join(
        f"<h3>{html.escape(section.get('title') or '')}</h3>{section.get('text') or ''}"
        for section in sections.values()
        if (section or {}).get("text")
    )
    location_parts = [p for p in [location.get("city"), location.get("region")] if p]
    identifier = company.get("identifier", "")
    fallback_url = f"https://jobs.smartrecruiters.com/{identifier}/{payload['id']}"

    return {
        "original_job_id": str(payload["id"]),
        "company_name_raw": company.get("name") or identifier or "Unknown",
        "job_title_raw": payload.get("name", ""),
        "description_html": _sanitize_html(description_html) or None,
        "description_text": _strip_html(description_html),
        "location_raw": ", ".join(location_parts),
        # The detail call also returns the canonical slugged posting/apply
        # URLs; the id-only URL built below is a valid redirect target, so it
        # stays as the fallback for a posting whose detail fetch degraded.
        "source_url": payload.get("postingUrl") or fallback_url,
        "apply_url": payload.get("applyUrl") or payload.get("postingUrl") or fallback_url,
        "posted_at": payload.get("releasedDate"),
        "employment_type_hint": employment.get("label") or department.get("label"),
        "remote_hint": location.get("remote"),
    }


def extract_stepstone(payload: dict) -> dict:
    return {
        "original_job_id": str(payload.get("id", "")),
        "company_name_raw": payload.get("company", "Unknown"),
        "job_title_raw": payload.get("title", ""),
        "description_html": None,
        "description_text": payload.get("description", "") or "",
        "location_raw": payload.get("location", ""),
        "source_url": payload.get("url", ""),
        "apply_url": payload.get("url", ""),
        "posted_at": payload.get("postedAt"),
        "employment_type_hint": payload.get("employmentType"),
        "remote_hint": payload.get("remote"),
    }


EXTRACTORS = {
    "greenhouse": extract_greenhouse,
    "lever": extract_lever,
    "arbeitsagentur": extract_arbeitsagentur,
    "stepstone": extract_stepstone,
    "personio": extract_personio,
    "smartrecruiters": extract_smartrecruiters,
}


def extract_common_fields(source_type: str, payload: dict) -> dict:
    extractor = EXTRACTORS.get(source_type)
    if extractor is None:
        raise ValueError(f"No extractor registered for sourceType={source_type!r}")
    return extractor(payload)
