"""Germany market pack constants, ported from packages/market-de/src/index.ts.

Keep this in sync with the TypeScript source of truth. Every value below is a
direct transcription -- do not "improve" values here without also updating the
TS file (or without a product decision to diverge).
"""
from __future__ import annotations

from typing import TypedDict


class SourceConfig(TypedDict):
    sourceId: str
    sourceType: str
    displayName: str
    trustTier: str  # 'high' | 'medium' | 'low'
    crawlFrequencyMinutes: int
    config: dict
    # domainAllowlist is not part of the TS MarketPackSourceConfig type, but the
    # `sources` Postgres table has a domainAllowlist column and the crawler's
    # SSRF/governance guard needs *some* source of truth for it. We define the
    # allowlists here, next to the source configs they belong to.
    domainAllowlist: list[str]


# Mirrors marketDe.sources in packages/market-de/src/index.ts, extended with the
# domain allowlists the crawler's governance guard checks against before any
# HTTP request is made.
SOURCES: list[SourceConfig] = [
    {
        "sourceId": "greenhouse-de",
        "sourceType": "greenhouse",
        "displayName": "Greenhouse (DE companies)",
        "trustTier": "high",
        "crawlFrequencyMinutes": 240,
        "config": {"boardTokens": []},
        "domainAllowlist": ["boards-api.greenhouse.io"],
    },
    {
        "sourceId": "lever-de",
        "sourceType": "lever",
        "displayName": "Lever (DE companies)",
        "trustTier": "high",
        "crawlFrequencyMinutes": 240,
        "config": {"siteSlugs": []},
        "domainAllowlist": ["api.lever.co"],
    },
    {
        "sourceId": "arbeitsagentur",
        "sourceType": "arbeitsagentur",
        "displayName": "Bundesagentur für Arbeit — Jobsuche API",
        "trustTier": "high",
        "crawlFrequencyMinutes": 360,
        "config": {"baseUrl": "https://rest.arbeitsagentur.de/jobboerse/jobsuche-service"},
        "domainAllowlist": ["rest.arbeitsagentur.de"],
    },
    {
        "sourceId": "stepstone-structured",
        "sourceType": "stepstone",
        "displayName": "Stepstone structured feed",
        "trustTier": "medium",
        "crawlFrequencyMinutes": 360,
        # TODO: Stepstone does not publish a documented public structured-feed
        # API. This config/domain is a best-effort placeholder until a real
        # feed URL / contract is confirmed (see workers/crawler/stepstone.py).
        "config": {},
        "domainAllowlist": ["www.stepstone.de"],
    },
]

SOURCES_BY_ID: dict[str, SourceConfig] = {s["sourceId"]: s for s in SOURCES}

# Mirrors marketDe.salaryParsing
SALARY_PARSING = {
    "currency": "EUR",
    "thousandsSeparator": ".",
    "decimalSeparator": ",",
}

# Mirrors marketDe.locationDictionary
LOCATION_DICTIONARY: dict[str, str] = {
    "berlin": "Berlin",
    "münchen": "Munich",
    "munich": "Munich",
    "koeln": "Cologne",
    "köln": "Cologne",
    "cologne": "Cologne",
    "frankfurt": "Frankfurt am Main",
    "frankfurt am main": "Frankfurt am Main",
    "hamburg": "Hamburg",
    "stuttgart": "Stuttgart",
    "duesseldorf": "Düsseldorf",
    "düsseldorf": "Düsseldorf",
    "leipzig": "Leipzig",
    "remote": "Remote",
    "homeoffice": "Remote",
}

# Mirrors marketDe.scamHeuristics -- these are regex *strings*, compiled lazily
# by common.scam_heuristics so callers can pick re.IGNORECASE etc.
SCAM_HEURISTICS = {
    "suspiciousDomainPatterns": [
        r"\.tk$",
        r"\.ml$",
        r"gmail\.com$",
        r"whatsapp",
        r"telegram",
    ],
    "suspiciousContactPatterns": [
        r"send.*(iban|bank details|kontodaten)",
        r"pay.*(registration fee|startgebühr|deposit)",
        r"whatsapp.*only",
        r"no interview required",
        r"wire transfer",
    ],
}

# Mirrors marketDe.companyAliases: canonical companyNameNormalized -> known aliases.
#
# Entries below "ergo"/"ferchau" are seeded speculatively (no live-crawl
# evidence yet) for the big, well-known employers most likely to post once
# Greenhouse/Lever/Stepstone board tokens are configured (currently empty --
# see SOURCE_CONFIG below). "ergo" and "ferchau" themselves *are* evidence-
# based: both spelling variants were observed in the same real Arbeitsagentur
# crawl (`SELECT "companyNameNormalized", COUNT(*) FROM raw_jobs GROUP BY 1`),
# so unlike the speculative entries these are verified against real rows.
#
# Deliberately conservative about what counts as "the same employer": only
# pure spelling/legal-form variants of one legal entity belong here, never
# a corporate family (e.g. Audi/VW, Mercedes-Benz/Daimler Truck stay separate
# -- merging them would hide genuinely distinct job postings, which is worse
# than leaving a cosmetic near-duplicate company name unresolved).
COMPANY_ALIASES: dict[str, list[str]] = {
    "sap se": ["SAP", "SAP AG", "SAP Deutschland"],
    "zalando se": ["Zalando", "Zalando SE"],
    "deutsche telekom ag": ["Deutsche Telekom", "T-Systems", "Telekom"],
    # Observed directly in raw_jobs as both "ergo" and "ergo group".
    "ergo": ["ERGO Group"],
    # Observed directly in raw_jobs across three branch offices, each with
    # "GmbH" mid-string (not stripped by normalize_company_name's end-of-
    # string suffix pass) -- same legal employer (Ferchau Engineering GmbH),
    # different offices, so each branch alias still resolves to one company
    # even though the differing location keeps them as distinct job postings.
    "ferchau": [
        "Ferchau GmbH",
        "Ferchau GmbH Niederlassung Bremen City",
        "Ferchau GmbH Niederlassung Lübeck",
        "Ferchau GmbH Niederlassung Rosenheim",
    ],
    # BASF/Bayer/adidas are deliberately NOT here: their only "alias" would be
    # the bare brand name, which already collapses to the same key via
    # normalize_company_name's legal-suffix stripping alone (e.g. "BASF SE"
    # and "BASF" both normalize to "basf") -- an explicit entry would resolve
    # zero genuinely different variants, just dead weight in this dict.
    "siemens ag": ["Siemens", "Siemens Deutschland"],
    "robert bosch gmbh": ["Bosch", "Robert Bosch"],
    "allianz se": ["Allianz", "Allianz Deutschland"],
    "continental ag": ["Continental", "Conti"],
}

# Not present in the TS pack (which only stores relative rankingWeights) --
# this is the Python-side mapping used by the deduplicator to turn a source's
# trustTier into the numeric sourceTrustScore persisted on raw_jobs / canonical_jobs.
TRUST_TIER_SCORES: dict[str, float] = {
    "high": 0.9,
    "medium": 0.6,
    "low": 0.3,
}

# Mirrors marketDe.rankingWeights (kept for completeness / future ranking layer).
RANKING_WEIGHTS = {
    "titleSimilarity": 0.25,
    "skillOverlap": 0.25,
    "locationFit": 0.15,
    "recency": 0.1,
    "salaryFit": 0.1,
    "languageFit": 0.05,
    "sourceTrust": 0.05,
    "riskPenalty": 0.05,
}

COUNTRY_CODE = "DE"
