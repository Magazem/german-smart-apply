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
        # Live-verified 2026-07-21: original 10 via scripts/verify_source_tokens.py
        # (each returned a nonzero job count); the 25 below via a live-network
        # WebSearch-grounded discovery pass, each individually screened against
        # its REAL, complete Greenhouse job list (Greenhouse's public boards API
        # returns a company's full list unpaginated, so this is an exact count,
        # not a sample) -- kept only if >=30% of that company's current listings
        # are Germany-located (city/"Germany" match). This is a company-scoped
        # source ("Greenhouse (DE companies)"), so a kept company's FULL board is
        # ingested, not just its German-located subset -- the >=30% bar exists to
        # keep the non-DE fraction of that from swamping the German job pool, not
        # to filter individual postings (raw_jobs has no per-job country filter
        # yet; see the countryCode note on normalizer/fields.py's
        # normalize_location, a separate, real follow-up). This is why large
        # global boards with real-but-thin DE presence (Stripe: 3/518 DE,
        # Airbnb: 6/201, Databricks: 30/784, ...) were deliberately NOT added
        # here even though their board tokens resolve and return jobs -- do not
        # add them on that basis alone without re-running this same DE% check.
        "config": {
            "boardTokens": [
                "n26",
                "getyourguide",
                "celonis",
                "contentful",
                "hellofresh",
                "grover",
                "trivago",
                "solarisbank",
                "traderepublic",
                "raisin",
                "airup",
                "alpineeagle",
                "anydesk",
                "avimedical",
                "blackforestlabs",
                "commercetools",
                "doctolib",
                "flaconi",
                "freenow",
                "helsing",
                "isaraerospace",
                "konux",
                "marvelfusion",
                "moia",
                "moonfare",
                "parloa",
                "scout24",
                "staffbase",
                "strato",
                "typeform",
                "urbansportsclub",
                "vay",
                "wooga",
                "wunderflats",
                "zattoo",
            ]
        },
        "domainAllowlist": ["boards-api.greenhouse.io"],
    },
    {
        "sourceId": "lever-de",
        "sourceType": "lever",
        "displayName": "Lever (DE companies)",
        "trustTier": "high",
        "crawlFrequencyMinutes": 240,
        # The original 20 candidates (scripts/verify_source_tokens.py) all
        # returned zero jobs. A second, live-network WebSearch-grounded
        # discovery pass (2026-07-21) found 43 genuinely working Lever slugs,
        # but most turned out to be non-German companies with only a thin
        # German-office presence (or, for a few outliers like "jobgether" /
        # "tsmg" / "weloglobal" at 600-3900 total postings, evidently
        # aggregator/staffing platforms, not single employers) -- screened
        # the same way as the Greenhouse list above (>=30% of a company's
        # current postings must be Germany-located; Lever's location field is
        # free text like Greenhouse's, not structured like SmartRecruiters').
        # Only these 6 cleared that bar.
        "config": {
            "siteSlugs": [
                "kolibrigames",
                "crytek",
                "finn",
                "vivenu",
                "netlight",
                "agicap",
            ]
        },
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
        # BLOCKED (not an engineering gap): Stepstone does not publish a
        # documented public structured-feed API. Getting real jobs out of this
        # source requires a partnerships/business conversation with Stepstone
        # for feed/API access, not more adapter code -- see
        # workers/crawler/stepstone.py's own docstring.
        "config": {},
        "domainAllowlist": ["www.stepstone.de"],
    },
    {
        "sourceId": "personio-de",
        "sourceType": "personio",
        "displayName": "Personio (DE companies)",
        "trustTier": "high",
        "crawlFrequencyMinutes": 240,
        # IMPORTANT: unlike Greenhouse/Lever (one fixed API host), each
        # Personio company is served from its own subdomain
        # (`{subdomain}.jobs.personio.de`), so domainAllowlist below must list
        # every subdomain added to companySubdomains explicitly -- keep the two
        # lists in lockstep when populating real companies.
        # Live-verified 2026-07-21: candis/clark via scripts/verify_source_tokens.py;
        # the other 98 via a live-network WebSearch-grounded discovery pass
        # (real German SME/Mittelstand companies found through their actual
        # careers pages, not guessed from brand names) -- every single one
        # returned a nonzero job count against the real Personio XML feed
        # (2,163 jobs total across those 98 at verification time). Personio is
        # itself a German HR company, disproportionately adopted by German
        # SMEs rather than just consumer brands, which is why this list skews
        # toward smaller/mid-size companies (logistics, consulting, local
        # retail/auto dealers, boutique agencies) rather than famous unicorns.
        "config": {
            "companySubdomains": [
                "candis",
                "clark",
                "1komma5grad",
                "4401",
                "agenturennetz",
                "agt-bus-eventlogistik-gmbh",
                "aktiv-apotheken-ohg",
                "algol-consulting",
                "anqa-itsecurity-de",
                "appliedai",
                "asb-berlin",
                "asg",
                "autohaus-bleker-gmbh",
                "autohaus-kahle-gmbh-co-kg",
                "autohaus-timmermanns",
                "autohaus-unterberger-gmbh",
                "autohaus-zemke",
                "banxware",
                "brix-consult-gmbh",
                "canal-control",
                "capmo",
                "cloover",
                "compipower-gmbh",
                "constanta-treuhand-gmbh",
                "cps-group",
                "cyber-wear",
                "cycle",
                "dci",
                "dedicom",
                "dgnb",
                "digital-loop",
                "dpa",
                "egym",
                "einhundert-energie-gmbh",
                "en-software",
                "entrix",
                "eqs-group",
                "eraneos",
                "erste-hausverwaltung-gmbh",
                "everreal",
                "falstaff",
                "filu-gmbh",
                "findiq-gmbh",
                "friedrich-zufall-gmbh",
                "frommer-legal",
                "gastro-soul",
                "gel-express-logistik",
                "gross-und-partner",
                "hafencity-hamburg",
                "hochfrequenz-unternehmensberatung-gmbh",
                "home-of-mobility",
                "hwp",
                "hws",
                "iits",
                "insglueck",
                "isg-express-logistik-gmbh",
                "its-gruppe",
                "jcb-deutschland-gmbh",
                "jobleads",
                "kabs-service-logistik-gmbh",
                "kcx",
                "kita-kinderzimmer",
                "lahrlogistics-gmbh",
                "laura-seiler-life-coaching-gmbh",
                "lautsprecherteufel",
                "legalhero",
                "lytd",
                "marketconsultive",
                "meyerpartner",
                "miles-mobility",
                "mobilityconcept",
                "munich-private-equity-ag",
                "neoom",
                "neumeier-ag",
                "nexum-ag",
                "pflege-de",
                "piabo",
                "pitch",
                "pm-team",
                "prenode",
                "raceon",
                "rebike-mobility",
                "ritterwald-unternehmensberatung-gmbh",
                "seek-development",
                "spedition-kruse",
                "stark",
                "startup-insider",
                "super-ai",
                "synvert",
                "syseleven",
                "taxy-io-gmbh",
                "teamative",
                "tierarztpluspartner",
                "tmh",
                "tngtech",
                "von-der-weppen",
                "wwp",
                "xitaso",
                "zeo-solar",
                "zollsoft",
            ]
        },
        "domainAllowlist": [
            "candis.jobs.personio.de",
            "clark.jobs.personio.de",
            "1komma5grad.jobs.personio.de",
            "4401.jobs.personio.de",
            "agenturennetz.jobs.personio.de",
            "agt-bus-eventlogistik-gmbh.jobs.personio.de",
            "aktiv-apotheken-ohg.jobs.personio.de",
            "algol-consulting.jobs.personio.de",
            "anqa-itsecurity-de.jobs.personio.de",
            "appliedai.jobs.personio.de",
            "asb-berlin.jobs.personio.de",
            "asg.jobs.personio.de",
            "autohaus-bleker-gmbh.jobs.personio.de",
            "autohaus-kahle-gmbh-co-kg.jobs.personio.de",
            "autohaus-timmermanns.jobs.personio.de",
            "autohaus-unterberger-gmbh.jobs.personio.de",
            "autohaus-zemke.jobs.personio.de",
            "banxware.jobs.personio.de",
            "brix-consult-gmbh.jobs.personio.de",
            "canal-control.jobs.personio.de",
            "capmo.jobs.personio.de",
            "cloover.jobs.personio.de",
            "compipower-gmbh.jobs.personio.de",
            "constanta-treuhand-gmbh.jobs.personio.de",
            "cps-group.jobs.personio.de",
            "cyber-wear.jobs.personio.de",
            "cycle.jobs.personio.de",
            "dci.jobs.personio.de",
            "dedicom.jobs.personio.de",
            "dgnb.jobs.personio.de",
            "digital-loop.jobs.personio.de",
            "dpa.jobs.personio.de",
            "egym.jobs.personio.de",
            "einhundert-energie-gmbh.jobs.personio.de",
            "en-software.jobs.personio.de",
            "entrix.jobs.personio.de",
            "eqs-group.jobs.personio.de",
            "eraneos.jobs.personio.de",
            "erste-hausverwaltung-gmbh.jobs.personio.de",
            "everreal.jobs.personio.de",
            "falstaff.jobs.personio.de",
            "filu-gmbh.jobs.personio.de",
            "findiq-gmbh.jobs.personio.de",
            "friedrich-zufall-gmbh.jobs.personio.de",
            "frommer-legal.jobs.personio.de",
            "gastro-soul.jobs.personio.de",
            "gel-express-logistik.jobs.personio.de",
            "gross-und-partner.jobs.personio.de",
            "hafencity-hamburg.jobs.personio.de",
            "hochfrequenz-unternehmensberatung-gmbh.jobs.personio.de",
            "home-of-mobility.jobs.personio.de",
            "hwp.jobs.personio.de",
            "hws.jobs.personio.de",
            "iits.jobs.personio.de",
            "insglueck.jobs.personio.de",
            "isg-express-logistik-gmbh.jobs.personio.de",
            "its-gruppe.jobs.personio.de",
            "jcb-deutschland-gmbh.jobs.personio.de",
            "jobleads.jobs.personio.de",
            "kabs-service-logistik-gmbh.jobs.personio.de",
            "kcx.jobs.personio.de",
            "kita-kinderzimmer.jobs.personio.de",
            "lahrlogistics-gmbh.jobs.personio.de",
            "laura-seiler-life-coaching-gmbh.jobs.personio.de",
            "lautsprecherteufel.jobs.personio.de",
            "legalhero.jobs.personio.de",
            "lytd.jobs.personio.de",
            "marketconsultive.jobs.personio.de",
            "meyerpartner.jobs.personio.de",
            "miles-mobility.jobs.personio.de",
            "mobilityconcept.jobs.personio.de",
            "munich-private-equity-ag.jobs.personio.de",
            "neoom.jobs.personio.de",
            "neumeier-ag.jobs.personio.de",
            "nexum-ag.jobs.personio.de",
            "pflege-de.jobs.personio.de",
            "piabo.jobs.personio.de",
            "pitch.jobs.personio.de",
            "pm-team.jobs.personio.de",
            "prenode.jobs.personio.de",
            "raceon.jobs.personio.de",
            "rebike-mobility.jobs.personio.de",
            "ritterwald-unternehmensberatung-gmbh.jobs.personio.de",
            "seek-development.jobs.personio.de",
            "spedition-kruse.jobs.personio.de",
            "stark.jobs.personio.de",
            "startup-insider.jobs.personio.de",
            "super-ai.jobs.personio.de",
            "synvert.jobs.personio.de",
            "syseleven.jobs.personio.de",
            "taxy-io-gmbh.jobs.personio.de",
            "teamative.jobs.personio.de",
            "tierarztpluspartner.jobs.personio.de",
            "tmh.jobs.personio.de",
            "tngtech.jobs.personio.de",
            "von-der-weppen.jobs.personio.de",
            "wwp.jobs.personio.de",
            "xitaso.jobs.personio.de",
            "zeo-solar.jobs.personio.de",
            "zollsoft.jobs.personio.de",
        ],
    },
    {
        "sourceId": "smartrecruiters-de",
        "sourceType": "smartrecruiters",
        "displayName": "SmartRecruiters (DE companies)",
        "trustTier": "high",
        "crawlFrequencyMinutes": 240,
        # Live-verified 2026-07-21: Continental via scripts/verify_source_tokens.py;
        # the 18 below via a live-network WebSearch-grounded discovery pass.
        # Unlike Greenhouse's free-text location, SmartRecruiters postings carry
        # a structured location.country field, so each candidate below was
        # screened by its real country breakdown rather than a text-match
        # heuristic. Every one of these 18 sampled either 100% of its postings
        # (totalFound <= ~260) or >=90% of a 100-posting sample of a larger
        # board -- kept as high-confidence. Several other live-verified
        # candidates (e.g. BoschGroup at 4731 total jobs) were deliberately
        # EXCLUDED despite resolving and returning jobs, because only ~25% of a
        # 100-item sample of that large a board was Germany-located and a
        # 100-item sample of thousands isn't a reliable estimate either way --
        # same reasoning as Greenhouse's own DE% bar above, do not add a
        # low-sampled-percentage large board on the basis of "it returns jobs"
        # alone. Note Continental itself is only ~16% Germany-located across
        # its full (SmartRecruiters-pagination-fixed) 949 postings -- it was
        # already configured before this change and is left as-is, but this is
        # the same category of company-vs-per-job scoping tradeoff discussed
        # above (see normalizer/fields.py's normalize_location TODO).
        "config": {
            "companyIdentifiers": [
                "Continental",
                "RVAllgemeineVersicherungenAG",
                "BayWaAG",
                "ATUAuto-Teile-Unger",
                "ArtemedSE",
                "BarmeniaGothaerAG",
                "burgerme",
                "VitosgGmbH",
                "Contilia1",
                "StrerSECoKGaAStrerGruppe",
                "ABOUTYOUGmbH",
                "EBreuningerGmbHCo",
                "ScalableGmbH",
                "ThaliaBcherGmbH1",
                "Tipico",
                "DreesSommerSE",
                "Redcare-Pharmacy",
                "Gerresheimer",
                "StepStoneGroup",
            ]
        },
        "domainAllowlist": ["api.smartrecruiters.com"],
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
    "titleSimilarity": 0.32,
    "skillOverlap": 0.32,
    "locationFit": 0.1,
    "recency": 0.07,
    "salaryFit": 0.08,
    "languageFit": 0.03,
    "sourceTrust": 0.03,
    "riskPenalty": 0.05,
}

COUNTRY_CODE = "DE"
