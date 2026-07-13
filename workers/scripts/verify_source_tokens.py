#!/usr/bin/env python3
"""Live-verifies candidate Greenhouse/Lever/SmartRecruiters/Personio tenant
identifiers against the real public APIs, and prints which ones actually
return jobs.

Why this script exists: a wrong board token/site slug/company identifier
silently returns an empty job list rather than an error (see
workers/crawler/greenhouse.py, lever.py, personio.py, smartrecruiters.py), so
adding an unverified guess straight into common/market_de.py risks shipping a
source that looks configured but fetches nothing, with no loud failure to
catch it. This script exists to do that verification step for you, in an
environment with real network access -- this sandbox's outbound network
policy blocks arbitrary external hosts, so these candidates below are
reasoned-about (known ATS users, from public knowledge) but NOT live-verified
yet. Do not copy them into common/market_de.py / packages/market-de/src/index.ts
until this script (or an equivalent manual check) confirms them against the
real APIs.

Usage:
    python scripts/verify_source_tokens.py

Exits non-zero if it hits any unexpected (non-404, non-200) response, so it
can be wired into CI as a periodic "did our configured tokens go stale" check
once the candidate lists below are replaced with verified, populated ones.
"""
from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import requests

# Reasoned-about candidates (known to use each ATS per public knowledge), NOT
# yet live-verified against the real endpoints -- see the module docstring.
# Board tokens/slugs are frequently company-chosen strings that don't always
# match the company's public brand name exactly, so don't assume a "miss"
# here means the company doesn't use that ATS -- it may just use a different
# token spelling than guessed below.
CANDIDATE_GREENHOUSE_TOKENS = [
    "n26",
    "getyourguide",
    "celonis",
    "contentful",
    "hellofresh",
    "flixbus",
    "grover",
    "wefox",
    "personio",
    "trivago",
    "solarisbank",
    "forto",
]

CANDIDATE_LEVER_SLUGS = [
    "n26",
    "grover",
    "forto",
    "wefox",
    "flaschenpost",
    "tier",
]

CANDIDATE_SMARTRECRUITERS_IDENTIFIERS = [
    "Bosch",
    "Continental",
    "DeutscheBahn",
    "Otto",
]

CANDIDATE_PERSONIO_SUBDOMAINS = [
    # Personio subdomains are per-account and much less guessable from a
    # company's public name than Greenhouse/Lever tokens -- these are
    # illustrative placeholders, not real candidates. Populating this list
    # for real requires asking each target company for their Personio
    # careers-page URL directly (it's usually linked from their own careers
    # page, e.g. "https://boards.eu.greenhouse.io/..." equivalent for
    # Personio is "https://{subdomain}.jobs.personio.de").
]


def check_greenhouse(session: requests.Session, token: str) -> tuple[bool, int]:
    resp = session.get(f"https://boards-api.greenhouse.io/v1/boards/{token}/jobs", timeout=10)
    if resp.status_code != 200:
        return False, 0
    jobs = resp.json().get("jobs", [])
    return len(jobs) > 0, len(jobs)


def check_lever(session: requests.Session, slug: str) -> tuple[bool, int]:
    resp = session.get(f"https://api.lever.co/v0/postings/{slug}?mode=json", timeout=10)
    if resp.status_code != 200:
        return False, 0
    postings = resp.json()
    return isinstance(postings, list) and len(postings) > 0, len(postings) if isinstance(postings, list) else 0


def check_smartrecruiters(session: requests.Session, identifier: str) -> tuple[bool, int]:
    resp = session.get(f"https://api.smartrecruiters.com/v1/companies/{identifier}/postings", timeout=10)
    if resp.status_code != 200:
        return False, 0
    content = resp.json().get("content", [])
    return len(content) > 0, len(content)


def check_personio(session: requests.Session, subdomain: str) -> tuple[bool, int]:
    resp = session.get(f"https://{subdomain}.jobs.personio.de/xml", timeout=10)
    if resp.status_code != 200:
        return False, 0
    # A crude but dependency-free position count; the real adapter uses
    # ElementTree, this script just wants a quick signal.
    count = resp.text.count("<position>")
    return count > 0, count


def main() -> int:
    session = requests.Session()
    session.headers["User-Agent"] = "german-smart-apply-source-verification/1.0"
    had_error = False

    def run_checks(label: str, candidates: list[str], check_fn) -> None:
        nonlocal had_error
        print(f"\n=== {label} ===")
        if not candidates:
            print("  (no candidates configured)")
            return
        for candidate in candidates:
            try:
                ok, count = check_fn(session, candidate)
                status = f"{count} jobs" if ok else "0 jobs / not found"
                print(f"  {candidate:<20} -> {status}")
            except requests.RequestException as exc:
                had_error = True
                print(f"  {candidate:<20} -> ERROR: {exc}")

    run_checks("Greenhouse", CANDIDATE_GREENHOUSE_TOKENS, check_greenhouse)
    run_checks("Lever", CANDIDATE_LEVER_SLUGS, check_lever)
    run_checks("SmartRecruiters", CANDIDATE_SMARTRECRUITERS_IDENTIFIERS, check_smartrecruiters)
    run_checks("Personio", CANDIDATE_PERSONIO_SUBDOMAINS, check_personio)

    print(
        "\nOnly copy entries that returned a nonzero job count into "
        "common/market_de.py AND packages/market-de/src/index.ts (both, kept "
        "in sync) -- do not add zero-result candidates on the assumption "
        "they'll fill in later; add them once they actually return jobs."
    )
    return 1 if had_error else 0


if __name__ == "__main__":
    sys.exit(main())
