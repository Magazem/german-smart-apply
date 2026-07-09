"""Source trust scoring and scam-risk heuristics.

Scam heuristics are ported verbatim (as regex strings) from
packages/market-de/src/index.ts `scamHeuristics` -- see common/market_de.py.
"""
from __future__ import annotations

import re
from urllib.parse import urlparse

from common import market_de

_DOMAIN_PATTERNS = [re.compile(p, re.IGNORECASE) for p in market_de.SCAM_HEURISTICS["suspiciousDomainPatterns"]]
_CONTACT_PATTERNS = [re.compile(p, re.IGNORECASE) for p in market_de.SCAM_HEURISTICS["suspiciousContactPatterns"]]

# Each matched suspicious-domain pattern is a stronger scam signal (the apply
# URL/source URL itself is untrustworthy) than a suspicious phrase appearing
# somewhere in free-text description, so it's weighted higher. Scores are
# additive and capped at 1.0.
DOMAIN_MATCH_WEIGHT = 0.5
CONTACT_MATCH_WEIGHT = 0.35


def trust_score_for_tier(trust_tier: str) -> float:
    return market_de.TRUST_TIER_SCORES.get(trust_tier, 0.5)


def _hostnames(*urls: str) -> set[str]:
    hosts = set()
    for url in urls:
        if not url:
            continue
        host = urlparse(url).hostname
        if host:
            hosts.add(host.lower())
    return hosts


def compute_scam_risk_score(description_text: str, apply_url: str = "", source_url: str = "") -> float:
    """suspiciousDomainPatterns are checked against the *hostname* of the apply
    URL / source URL, not the full URL -- several of the ported patterns are
    end-anchored (e.g. `\\.tk$`), which only makes sense against a bare
    hostname (a full URL almost always has a path after the host, which would
    break the `$` anchor). suspiciousContactPatterns are checked against the
    free-text job description, where scam listings tend to ask for personal
    data or off-platform contact.
    """
    score = 0.0
    hosts = _hostnames(apply_url, source_url)
    for pattern in _DOMAIN_PATTERNS:
        if any(pattern.search(host) for host in hosts):
            score += DOMAIN_MATCH_WEIGHT

    text = description_text or ""
    for pattern in _CONTACT_PATTERNS:
        if pattern.search(text):
            score += CONTACT_MATCH_WEIGHT

    return min(round(score, 4), 1.0)
