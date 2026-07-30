"""Field-level normalization transforms.

Every function here is a pure function: given raw input, return a normalized
value. No I/O, no database access -- this is what unit tests exercise directly.
"""
from __future__ import annotations

import re

try:
    from langdetect import DetectorFactory, detect

    DetectorFactory.seed = 0  # deterministic results
    _LANGDETECT_AVAILABLE = True
except ImportError:  # pragma: no cover - langdetect is a declared dependency
    _LANGDETECT_AVAILABLE = False


# ---------------------------------------------------------------------------
# Company name normalization
# ---------------------------------------------------------------------------

# Legal-form tokens stripped from the *end* of a company name, repeatedly,
# so "Acme GmbH & Co. KG" -> "Acme" and "SAP SE" -> "SAP". This intentionally
# also strips generic forms like "SE"/"AG" that market-de's seed company
# aliases keep in their canonical key (e.g. "sap se") -- that's fine: the
# company_aliases table (seeded via deduplicator/seed.py) re-normalizes those
# canonical keys through this exact function too, so everything funnels
# through one consistent normalization regardless of legal-suffix quirks.
_LEGAL_SUFFIX_TOKENS = {
    "gmbh", "mbh", "ag", "se", "kgaa", "kg", "ug", "ev",
    "inc", "ltd", "corp", "corporation", "plc", "llc", "sarl", "co",
}

_WORD_TOKEN_RE = re.compile(r"[\w&-]+", re.UNICODE)


def normalize_company_name(raw: str) -> str:
    name = (raw or "").strip()
    if not name:
        return ""
    tokens = _WORD_TOKEN_RE.findall(name)
    while tokens:
        last = tokens[-1].strip(".,").lower()
        if last in _LEGAL_SUFFIX_TOKENS or last == "&":
            tokens.pop()
            continue
        break
    if not tokens:
        # Every token was a legal-form suffix (e.g. name was just "GmbH") --
        # fall back to the original string rather than returning empty.
        return re.sub(r"\s+", " ", name).strip().lower()
    result = " ".join(tokens)
    return re.sub(r"\s+", " ", result).strip().lower()


# ---------------------------------------------------------------------------
# Job title normalization
# ---------------------------------------------------------------------------

# German job postings routinely suffix titles with a gender-neutrality marker
# such as "(m/w/d)" or "(m/w/d/x)" -- stripping it means "Senior Engineer
# (m/w/d)" and "Senior Engineer" normalize to the same title for dedup
# purposes. "x" (a common further-inclusive variant alongside m/w/d) must be
# in the character class or "(m/w/d/x)" only partially matches, leaving a
# stray "(/x)" fragment behind.
_GENDER_MARKER_CORE = r"[mwfdx](?:\s*/\s*[mwfdx]){1,3}"
_GENDER_MARKER_RE = re.compile(
    rf"\(\s*{_GENDER_MARKER_CORE}\s*\)|\b{_GENDER_MARKER_CORE}\b", re.IGNORECASE
)
# Gender-neutral suffix notations directly on a German noun ("Entwickler*in",
# "Entwickler:in", "Entwickler_in" -- asterisk/colon/underscore are all
# common house styles for the same Gendersternchen convention).
_GENDER_INLINE_SUFFIX_RE = re.compile(r"[*:_][a-zA-Zäöü]+\b")


def normalize_job_title(raw: str) -> str:
    if not raw:
        return ""
    title = _GENDER_MARKER_RE.sub("", raw)
    title = _GENDER_INLINE_SUFFIX_RE.sub("", title)
    title = title.replace("*", "")
    title = re.sub(r"\s+", " ", title).strip(" -")
    return title.lower()


# ---------------------------------------------------------------------------
# Location normalization
# ---------------------------------------------------------------------------

# Country names as ATS boards actually write them, in English and German, plus
# bare ISO-3166 alpha-2 codes, mapped to alpha-2.
#
# Why this exists: the market pack's location dictionary is keyed on CITY name
# and carries no country information, so normalize_location() previously
# returned the market default ("DE") on every path -- including its own
# no-match fallback. A Greenhouse posting reading "Shanghai, China" was stored
# with countryCode="DE", passed the `locationCountryCode=DE` hard filter in
# apps/api's JobsService, and was reported `eligible: true` by RankingService,
# whose only hard country check is `profile.targetCountryCode !==
# job.countryCode`. Boards are admitted to this crawl at a >=30% Germany-located
# bar (see common/market_de.py), so the non-German remainder is the majority of
# some boards' postings, not an edge case.
#
# Deliberately NOT exhaustive-by-generation: only names that appear as an
# explicit country segment in a location string. See normalize_location() for
# why an unrecognized location still falls back to the market default rather
# than to "unknown".
_COUNTRY_NAME_TO_CODE: dict[str, str] = {
    "germany": "DE", "deutschland": "DE", "de": "DE", "ger": "DE",
    "austria": "AT", "österreich": "AT", "oesterreich": "AT", "at": "AT",
    "switzerland": "CH", "schweiz": "CH", "ch": "CH",
    "france": "FR", "frankreich": "FR", "fr": "FR",
    "netherlands": "NL", "niederlande": "NL", "holland": "NL", "nl": "NL",
    "belgium": "BE", "belgien": "BE", "be": "BE",
    "luxembourg": "LU", "luxemburg": "LU", "lu": "LU",
    "united kingdom": "GB", "uk": "GB", "great britain": "GB",
    "england": "GB", "grossbritannien": "GB", "großbritannien": "GB", "gb": "GB",
    "ireland": "IE", "irland": "IE", "ie": "IE",
    "spain": "ES", "spanien": "ES", "es": "ES",
    "portugal": "PT", "pt": "PT",
    "italy": "IT", "italien": "IT", "it": "IT",
    "poland": "PL", "polen": "PL", "pl": "PL",
    "czech republic": "CZ", "czechia": "CZ", "tschechien": "CZ", "cz": "CZ",
    "slovakia": "SK", "slowakei": "SK", "sk": "SK",
    "hungary": "HU", "ungarn": "HU", "hu": "HU",
    "romania": "RO", "rumänien": "RO", "rumaenien": "RO", "ro": "RO",
    "bulgaria": "BG", "bulgarien": "BG", "bg": "BG",
    "greece": "GR", "griechenland": "GR", "gr": "GR",
    "sweden": "SE", "schweden": "SE", "se": "SE",
    "norway": "NO", "norwegen": "NO", "no": "NO",
    "denmark": "DK", "dänemark": "DK", "daenemark": "DK", "dk": "DK",
    "finland": "FI", "finnland": "FI", "fi": "FI",
    "estonia": "EE", "estland": "EE", "ee": "EE",
    "latvia": "LV", "lettland": "LV", "lv": "LV",
    "lithuania": "LT", "litauen": "LT", "lt": "LT",
    "united states": "US", "united states of america": "US", "usa": "US",
    "u.s.": "US", "us": "US", "vereinigte staaten": "US",
    "canada": "CA", "kanada": "CA", "ca": "CA",
    "mexico": "MX", "mexiko": "MX", "mx": "MX",
    "brazil": "BR", "brasilien": "BR", "br": "BR",
    "china": "CN", "cn": "CN",
    "japan": "JP", "jp": "JP",
    "india": "IN", "indien": "IN", "in": "IN",
    "singapore": "SG", "singapur": "SG", "sg": "SG",
    "australia": "AU", "australien": "AU", "au": "AU",
    "new zealand": "NZ", "neuseeland": "NZ", "nz": "NZ",
    "israel": "IL", "il": "IL",
    "turkey": "TR", "türkei": "TR", "tuerkei": "TR", "tr": "TR",
    "ukraine": "UA", "ua": "UA",
    "south africa": "ZA", "südafrika": "ZA", "suedafrika": "ZA", "za": "ZA",
    "south korea": "KR", "südkorea": "KR", "korea": "KR", "kr": "KR",
    "hong kong": "HK", "hongkong": "HK", "hk": "HK",
    "united arab emirates": "AE", "uae": "AE", "ae": "AE",
}


def _country_code_from_parts(parts: list[str]) -> str | None:
    """The ISO-3166 alpha-2 code named explicitly in a location string, if any.

    Scans right-to-left because the country is conventionally the last segment
    ("Berlin, Germany", "Austin, TX, United States") - scanning left-to-right
    would let a city that happens to collide with a two-letter code win.
    """
    for part in reversed(parts):
        code = _COUNTRY_NAME_TO_CODE.get(part.lower())
        if code:
            return code
    return None


def normalize_location(raw: str, location_dictionary: dict[str, str], default_country_code: str = "DE") -> tuple[str, str]:
    """Return (locationNormalized, countryCode).

    Splits multi-value strings ("Berlin, Germany", "Berlin / Remote") and
    matches each part against the market pack's location dictionary. Falls
    back to a title-cased version of the first part if nothing matches.

    The country code comes from an explicitly-named country segment when the
    string has one, and only otherwise from `default_country_code`. That
    asymmetry is deliberate rather than lazy: the market pack's location
    dictionary holds 8 German cities, so a dictionary MISS is not evidence of
    a foreign posting - most real German cities (Nürnberg, Dresden, Hannover,
    ...) miss it too. Treating every miss as "unknown country" would drop the
    majority of genuinely German listings out of a DE-filtered search, which
    is a worse failure than the one being fixed. So this resolves the case
    boards actually produce for foreign roles - an explicit country segment -
    and leaves a bare unrecognized city on the market default. A bare
    non-German city name with no country segment ("Shanghai" alone) is still
    misclassified; closing that needs a real city->country dataset, not a
    longer hand-kept dictionary.
    """
    if not raw or not raw.strip():
        return ("Unknown", default_country_code)

    parts = [p.strip() for p in re.split(r"[,/|]", raw) if p.strip()]
    country_code = _country_code_from_parts(parts) or default_country_code

    for part in parts:
        key = part.lower()
        if key in location_dictionary:
            return (location_dictionary[key], country_code)

    # Prefer a segment that isn't the country name itself, so "Shanghai, China"
    # normalizes to "Shanghai" rather than to "China".
    city_parts = [p for p in parts if p.lower() not in _COUNTRY_NAME_TO_CODE]
    fallback = (city_parts or parts or [raw.strip()])[0]
    return (fallback.title(), country_code)


# ---------------------------------------------------------------------------
# Salary parsing (German `.` thousands / `,` decimal conventions)
# ---------------------------------------------------------------------------

_NUMBER_GROUP = r"\d{1,3}(?:\.\d{3})+(?:,\d+)?|\d{4,6}(?:,\d+)?"
_SALARY_RE = re.compile(
    rf"(?P<cur1>€|EUR|Euro)?\s*"
    rf"(?P<num1>{_NUMBER_GROUP})"
    # "und" is a common German range connector ("zwischen X und Y Euro"),
    # alongside the dash/"bis"/"to" forms.
    rf"(?:\s*(?:-|–|bis|to|und)\s*(?P<num2>{_NUMBER_GROUP}))?"
    rf"\s*(?P<cur2>€|EUR|Euro)?",
    re.IGNORECASE,
)

# Explicit salary-context keywords (DE + EN). A currency-adjacent number that
# sits near one of these is far more likely to be the actual salary than an
# arbitrary Euro figure elsewhere in the description (a signing bonus,
# relocation allowance, revenue figure, etc). Includes the common ASCII
# fold of "Vergütung" ("Verguetung") since umlaut-stripping is common in
# scraped/OCR'd source text.
_SALARY_CONTEXT_KEYWORDS = [
    "bruttojahresgehalt",
    "jahresgehalt",
    "gehaltsspanne",
    "gehaltsrahmen",
    "gehalt",
    "vergütung",
    "verguetung",
    "verdienst",
    "compensation",
    "salary",
]
_SALARY_CONTEXT_RE = re.compile(
    "|".join(re.escape(k) for k in _SALARY_CONTEXT_KEYWORDS), re.IGNORECASE
)
# How close (in characters, midpoint-to-midpoint) a number must be to a
# salary-context keyword to count as "adjacent" to it. Wide enough to cover
# "Jahresgehalt: 60.000 - 75.000 EUR" but not wide enough to casually pull in
# an unrelated figure from a different sentence.
_SALARY_CONTEXT_WINDOW_CHARS = 60

# Period-language keywords used to detect whether a matched figure is a
# monthly or an annual amount. The stored schema (salaryMin/salaryMax) and
# the frontend (apps/web/src/lib/format.ts formatSalary) have no period
# field at all and implicitly assume annual -- so a confidently-detected
# monthly figure must be normalized to its annual equivalent (x12) before
# being returned, rather than stored as-is.
_MONTHLY_PERIOD_KEYWORDS = [
    "brutto/monat",
    "pro monat",
    "im monat",
    "monatsgehalt",
    "monatlich",
    "/monat",
    "mtl.",
]
_MONTHLY_PERIOD_RE = re.compile(
    "|".join(re.escape(k) for k in _MONTHLY_PERIOD_KEYWORDS), re.IGNORECASE
)
_ANNUAL_PERIOD_KEYWORDS = [
    "bruttojahresgehalt",
    "jahresgehalt",
    "brutto/jahr",
    "pro jahr",
    "im jahr",
    "jährlich",
    "jaehrlich",
    "per annum",
    "annually",
    "p.a.",
    "p. a.",
]
_ANNUAL_PERIOD_RE = re.compile(
    "|".join(re.escape(k) for k in _ANNUAL_PERIOD_KEYWORDS), re.IGNORECASE
)
# Period keywords sit right next to the figure they describe ("4.500 EUR
# pro Monat"), so this window is intentionally tighter than the
# salary-context one.
_PERIOD_WINDOW_CHARS = 40

# Plausibility bounds for a *normalized annual* German-market salary. Chosen
# to comfortably bracket real full-time annual salaries while rejecting
# obviously-wrong matches (a hourly rate, a headcount, a misparsed figure)
# before they ever reach the database. Matches this codebase's conservative
# posture elsewhere (e.g. company_aliases only merges on very confident
# matches) -- no salary shown is strictly better than a confidently wrong one.
_MIN_PLAUSIBLE_ANNUAL_SALARY = 15_000
_MAX_PLAUSIBLE_ANNUAL_SALARY = 500_000


def _nearest_keyword_distance(
    pattern: re.Pattern[str], text: str, match_start: int, match_end: int
) -> float | None:
    """Midpoint-to-midpoint distance (in characters) from a [start, end) span
    to the closest occurrence of `pattern` in `text`, or None if `pattern`
    doesn't occur at all.
    """
    mid = (match_start + match_end) / 2
    best: float | None = None
    for kw_match in pattern.finditer(text):
        kw_mid = (kw_match.start() + kw_match.end()) / 2
        dist = abs(kw_mid - mid)
        if best is None or dist < best:
            best = dist
    return best


def _period_multiplier(text: str, match_start: int, match_end: int) -> int:
    """Return 12 if a monthly-period keyword is confidently the nearest
    period signal to this match, else 1 (the implicit annual convention).
    Ties or ambiguity (both signals present at the same distance) fall back
    to 1 rather than guessing monthly and inflating a figure incorrectly.
    """
    monthly_dist = _nearest_keyword_distance(_MONTHLY_PERIOD_RE, text, match_start, match_end)
    annual_dist = _nearest_keyword_distance(_ANNUAL_PERIOD_RE, text, match_start, match_end)

    monthly_near = monthly_dist is not None and monthly_dist <= _PERIOD_WINDOW_CHARS
    annual_near = annual_dist is not None and annual_dist <= _PERIOD_WINDOW_CHARS

    if monthly_near and (not annual_near or monthly_dist < annual_dist):  # type: ignore[operator]
        return 12
    return 1


def parse_salary(
    text: str,
    thousands_separator: str = ".",
    decimal_separator: str = ",",
    currency: str = "EUR",
) -> tuple[int | None, int | None, str | None]:
    """Extract (salaryMin, salaryMax, salaryCurrency) from free text.

    Requires an explicit currency marker (€ / EUR / Euro) adjacent to the
    number(s) -- this avoids false positives on unrelated numbers elsewhere in
    a job description (phone numbers, headcounts, years of experience, etc).

    Beyond that base filter, this applies three precision passes calibrated
    for the German job market:

    1. Keyword preference: among all currency-adjacent numbers found in the
       text, those near an explicit salary-context keyword (Gehalt,
       Vergütung, Jahresgehalt, Verdienst, salary, compensation, ...) are
       preferred over any other Euro figure with no such keyword nearby --
       this deprioritizes signing bonuses, relocation allowances, or other
       incidental Euro amounts mentioned earlier in the text. If nothing in
       the text is keyword-adjacent, the single unambiguous candidate (if
       there is exactly one) is still used; but with *multiple* competing
       currency figures and no keyword to disambiguate them, this is
       genuinely ambiguous and None is returned rather than guessing.
    2. Period normalization: a figure with nearby monthly-period language
       ("pro Monat", "monatlich", "/Monat", ...) is annualized (x12) before
       being returned, since the schema/frontend only ever store and display
       a single implicitly-annual figure with no period field.
    3. Plausibility bounds: the normalized annual figure(s) must fall within
       a plausible German-market annual salary range. A candidate outside
       that range is skipped in favor of the next-best candidate (if any);
       if nothing plausible remains, None is returned rather than storing an
       implausible number.
    """
    if not text:
        return (None, None, None)

    def to_number(raw_num: str | None) -> int | None:
        if raw_num is None:
            return None
        cleaned = raw_num.replace(thousands_separator, "").replace(decimal_separator, ".")
        try:
            return round(float(cleaned))
        except ValueError:
            return None

    candidates: list[tuple[int, int, int, int | None, float | None]] = []
    for match in _SALARY_RE.finditer(text):
        if not (match.group("cur1") or match.group("cur2")):
            continue
        n1 = to_number(match.group("num1"))
        if n1 is None:
            continue
        n2 = to_number(match.group("num2"))
        kw_distance = _nearest_keyword_distance(_SALARY_CONTEXT_RE, text, match.start(), match.end())
        candidates.append((match.start(), match.end(), n1, n2, kw_distance))

    if not candidates:
        return (None, None, None)

    keyword_adjacent = [
        c for c in candidates if c[4] is not None and c[4] <= _SALARY_CONTEXT_WINDOW_CHARS
    ]

    if keyword_adjacent:
        pool = sorted(keyword_adjacent, key=lambda c: c[4])  # type: ignore[arg-type]
    elif len(candidates) == 1:
        # Only one currency-adjacent number in the whole text -- nothing to
        # disambiguate against, so there's no ambiguity even without a
        # nearby keyword.
        pool = candidates
    else:
        # Multiple competing currency figures and none of them tied to a
        # salary-context keyword: we can't confidently tell which (if any)
        # is the real salary. Conservative: no salary beats a wrong one.
        return (None, None, None)

    for start, end, n1, n2, _kw_distance in pool:
        multiplier = _period_multiplier(text, start, end)
        annual_n1 = round(n1 * multiplier)
        annual_n2 = round(n2 * multiplier) if n2 is not None else None

        values = [v for v in (annual_n1, annual_n2) if v is not None]
        if any(v < _MIN_PLAUSIBLE_ANNUAL_SALARY or v > _MAX_PLAUSIBLE_ANNUAL_SALARY for v in values):
            continue

        if annual_n2 is None:
            return (annual_n1, annual_n1, currency)
        return (min(annual_n1, annual_n2), max(annual_n1, annual_n2), currency)

    return (None, None, None)


# ---------------------------------------------------------------------------
# Language detection
# ---------------------------------------------------------------------------

_DE_STOPWORDS = {
    "der", "die", "das", "und", "mit", "für", "wir", "sie", "unser", "unsere",
    "erfahrung", "kenntnisse", "aufgaben", "anforderungen", "bewerbung",
    "gehalt", "stelle", "unternehmen", "suchen", "idealerweise", "mindestens",
    "jahre", "team", "du", "bist", "hast", "einem", "einer", "sind",
}
_EN_STOPWORDS = {
    "the", "and", "with", "for", "you", "we", "our", "experience", "skills",
    "responsibilities", "requirements", "application", "salary", "role",
    "company", "looking", "ideally", "least", "years", "team", "your",
    "are", "have", "will", "join",
}


def _heuristic_detect_language(text: str) -> str:
    words = re.findall(r"[a-zA-ZäöüÄÖÜß]+", text.lower())
    de_score = sum(1 for w in words if w in _DE_STOPWORDS)
    en_score = sum(1 for w in words if w in _EN_STOPWORDS)
    return "de" if de_score > en_score else "en"


def detect_language(text: str) -> str:
    if not text or not text.strip():
        return "en"
    if _LANGDETECT_AVAILABLE:
        try:
            detected = detect(text)
            if detected in ("de", "en"):
                return detected
        except Exception:
            pass
    return _heuristic_detect_language(text)


# ---------------------------------------------------------------------------
# Seniority inference (EN + DE keywords, most-senior-first)
# ---------------------------------------------------------------------------

_SENIORITY_KEYWORDS: list[tuple[str, list[str]]] = [
    ("principal", ["principal", "staff engineer", "distinguished", "head of", "director"]),
    ("lead", ["lead", "team lead", "teamlead", "leitung", "leiter", "leiterin"]),
    ("senior", ["senior", "sr.", "sr ", "erfahren"]),
    ("mid", ["mid-level", "mid level", "intermediate", "mittlere ebene"]),
    ("junior", ["junior", "jr.", "jr ", "einsteiger", "berufseinsteiger", "trainee", "entry level", "entry-level"]),
    ("intern", ["intern", "internship", "praktikant", "praktikum"]),
]


def infer_seniority(title: str) -> str | None:
    """Infer a seniority level from a job title, or None when unclear.

    Matches on WORD boundaries, not raw substrings. Plain `kw in haystack`
    classified any title containing "International" or "Internal" as an
    internship, because "intern" is a prefix of both - verified:
    "Manager International Business" and "Internal Audit Specialist" both
    resolved to "intern". That is not a cosmetic mislabel: JobsService applies
    `where.seniority = { in: [...] }` as a HARD FILTER, so those postings
    became reachable only by candidates filtering for internships, and
    invisible to everyone else.

    Multi-word keywords still match as phrases; the boundary classes just stop
    a keyword from matching inside a longer word.
    """
    if not title:
        return None
    haystack = title.lower()
    for seniority, keywords in _SENIORITY_KEYWORDS:
        for kw in keywords:
            if re.search(rf"(?<![\w]){re.escape(kw.strip())}(?![\w])", haystack):
                return seniority
    return None


# ---------------------------------------------------------------------------
# Employment type inference
# ---------------------------------------------------------------------------

_EMPLOYMENT_TYPE_KEYWORDS: list[tuple[str, list[str]]] = [
    ("internship", ["praktikum", "praktikant", "internship", " intern "]),
    # "working_student"/"part_time" (underscore, enum-convention form) match
    # structured source fields that pass their own enum value straight
    # through as the `hint` (e.g. Stepstone's employmentType), not just the
    # natural-language forms a title/description would use.
    ("working_student", ["werkstudent", "working student", "working_student"]),
    ("part_time", ["teilzeit", "part-time", "part time", "part_time"]),
    ("freelance", ["freelance", "freiberuflich"]),
    ("contract", ["contract", "befristet", "temporary", "zeitarbeit"]),
]


def infer_employment_type(title: str, description: str = "", hint: str | None = None) -> str:
    """Title takes priority over description: a title that says "Werkstudent"
    should win even if the description happens to also mention "Praktikum"
    in passing (e.g. "Praktikum/Werkstudent" ad copy). Falls back to scanning
    title+description+hint together if the title alone is inconclusive.
    """
    title_haystack = f" {title or ''} ".lower()
    for employment_type, keywords in _EMPLOYMENT_TYPE_KEYWORDS:
        for kw in keywords:
            if kw in title_haystack:
                return employment_type

    full_haystack = f" {' '.join(filter(None, [hint, title, description]))} ".lower()
    for employment_type, keywords in _EMPLOYMENT_TYPE_KEYWORDS:
        for kw in keywords:
            if kw in full_haystack:
                return employment_type

    return "full_time"


# ---------------------------------------------------------------------------
# Remote-type inference
# ---------------------------------------------------------------------------

def infer_remote_type(location_raw: str, remote_hint=None, description: str = "") -> str:
    """Infer onsite/hybrid/remote from the location, an explicit source hint,
    and the description text.

    The description is read because for four of the five job-producing sources
    (greenhouse, lever, personio, arbeitsagentur) `remote_hint` is always None -
    only SmartRecruiters and Stepstone supply one - so without it the answer
    could only ever come from the location STRING containing "remote"/"hybrid".
    German postings almost never do that; they write "Homeoffice möglich" or
    "hybrides Arbeiten" in the body. The result was a near-constant "onsite",
    and since JobsService applies remoteType as a HARD FILTER, a candidate
    filtering for remote work got a near-empty result set on a product whose
    core promise is matching.

    infer_employment_type() directly below already scans the description for
    its own keywords; this function simply never received it.

    German remote vocabulary is included explicitly - matching English
    "remote"/"hybrid" only would have left most of the corpus unreadable.
    """
    haystack = (location_raw or "").lower()
    if isinstance(remote_hint, bool) and remote_hint:
        haystack += " remote"
    elif isinstance(remote_hint, str):
        haystack += " " + remote_hint.lower()
    # Weaker evidence than the location field or an explicit structured hint, so
    # it is appended rather than given its own precedence: a description that
    # mentions both remote and hybrid still resolves to hybrid below, which is
    # the conservative reading of "hybrid role with home-office days".
    haystack += " " + (description or "").lower()

    has_remote = (
        "remote" in haystack
        or "homeoffice" in haystack
        or "home office" in haystack
        or "home-office" in haystack
        or "telearbeit" in haystack
        or "vollständig remote" in haystack
    )
    has_hybrid = "hybrid" in haystack or "hybrides" in haystack
    if has_remote and has_hybrid:
        return "hybrid"
    if has_remote:
        return "remote"
    if has_hybrid:
        return "hybrid"
    return "onsite"


# ---------------------------------------------------------------------------
# Tech-stack tag extraction
# ---------------------------------------------------------------------------

TECH_KEYWORDS = [
    "python", "java", "javascript", "typescript", "react", "angular", "vue",
    "node.js", "go", "golang", "rust", "c++", "c#", ".net",
    "aws", "azure", "gcp", "docker", "kubernetes", "k8s", "terraform",
    "sql", "postgres", "postgresql", "mysql", "mongodb", "redis", "kafka",
    "spark", "hadoop", "graphql", "django", "flask", "spring", "spring boot",
    "ruby", "rails", "php", "swift", "kotlin", "scala", "html", "css",
    "webpack", "git", "ci/cd", "jenkins", "ansible", "linux",
    "machine learning", "nlp",
]


def extract_tech_stack_tags(title: str, description: str = "") -> list[str]:
    haystack = f"{title or ''} {description or ''}".lower()
    found = set()
    for keyword in TECH_KEYWORDS:
        pattern = re.escape(keyword)
        if re.search(rf"(?<![\w]){pattern}(?![\w])", haystack):
            found.add(keyword)
    return sorted(found)
