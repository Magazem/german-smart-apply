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

import re
from datetime import datetime, timezone


def _strip_html(html: str) -> str:
    text = re.sub(r"<[^>]+>", " ", html or "")
    text = re.sub(r"\s+", " ", text)
    return text.strip()


def extract_greenhouse(payload: dict) -> dict:
    location = payload.get("location") or {}
    content = payload.get("content")
    return {
        "original_job_id": str(payload["id"]),
        "company_name_raw": payload.get("company_name") or payload.get("_board_token", "Unknown"),
        "job_title_raw": payload.get("title", ""),
        "description_html": content,
        "description_text": _strip_html(content or ""),
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
        "description_html": payload.get("description"),
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
        "description_text": payload.get("stellenbeschreibung", "") or "",
        "location_raw": location_raw,
        "source_url": detail_url,
        "apply_url": external_url or detail_url,
        "posted_at": payload.get("aktuelleVeroeffentlichungsdatum") or payload.get("eintrittsdatum"),
        "employment_type_hint": None,
        "remote_hint": None,
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
}


def extract_common_fields(source_type: str, payload: dict) -> dict:
    extractor = EXTRACTORS.get(source_type)
    if extractor is None:
        raise ValueError(f"No extractor registered for sourceType={source_type!r}")
    return extractor(payload)
