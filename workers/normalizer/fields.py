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
# such as "(m/w/d)" -- stripping it means "Senior Engineer (m/w/d)" and
# "Senior Engineer" normalize to the same title for dedup purposes.
_GENDER_MARKER_CORE = r"[mwfd](?:\s*/\s*[mwfd]){1,3}"
_GENDER_MARKER_RE = re.compile(
    rf"\(\s*{_GENDER_MARKER_CORE}\s*\)|\b{_GENDER_MARKER_CORE}\b", re.IGNORECASE
)
_GENDER_STAR_RE = re.compile(r"[*][a-zA-Zäöü]+\b")


def normalize_job_title(raw: str) -> str:
    if not raw:
        return ""
    title = _GENDER_MARKER_RE.sub("", raw)
    title = _GENDER_STAR_RE.sub("", title)
    title = title.replace("*", "")
    title = re.sub(r"\s+", " ", title).strip(" -")
    return title.lower()


# ---------------------------------------------------------------------------
# Location normalization
# ---------------------------------------------------------------------------

def normalize_location(raw: str, location_dictionary: dict[str, str], default_country_code: str = "DE") -> tuple[str, str]:
    """Return (locationNormalized, countryCode).

    Splits multi-value strings ("Berlin, Germany", "Berlin / Remote") and
    matches each part against the market pack's location dictionary. Falls
    back to a title-cased version of the first part if nothing matches.
    """
    if not raw or not raw.strip():
        return ("Unknown", default_country_code)

    parts = [p.strip() for p in re.split(r"[,/|]", raw) if p.strip()]
    for part in parts:
        key = part.lower()
        if key in location_dictionary:
            return (location_dictionary[key], default_country_code)

    fallback = parts[0] if parts else raw.strip()
    return (fallback.title(), default_country_code)


# ---------------------------------------------------------------------------
# Salary parsing (German `.` thousands / `,` decimal conventions)
# ---------------------------------------------------------------------------

_NUMBER_GROUP = r"\d{1,3}(?:\.\d{3})+(?:,\d+)?|\d{4,6}(?:,\d+)?"
_SALARY_RE = re.compile(
    rf"(?P<cur1>€|EUR|Euro)?\s*"
    rf"(?P<num1>{_NUMBER_GROUP})"
    rf"(?:\s*(?:-|–|bis|to)\s*(?P<num2>{_NUMBER_GROUP}))?"
    rf"\s*(?P<cur2>€|EUR|Euro)?",
    re.IGNORECASE,
)


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
    Uses finditer (not search) so an earlier, currency-less numeric match
    (e.g. a phone number) doesn't block a real salary mentioned later in the
    same text.
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

    for match in _SALARY_RE.finditer(text):
        if not (match.group("cur1") or match.group("cur2")):
            continue
        n1 = to_number(match.group("num1"))
        n2 = to_number(match.group("num2"))
        if n1 is None:
            continue
        if n2 is None:
            return (n1, n1, currency)
        return (min(n1, n2), max(n1, n2), currency)

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
    if not title:
        return None
    haystack = title.lower()
    for seniority, keywords in _SENIORITY_KEYWORDS:
        for kw in keywords:
            if kw in haystack:
                return seniority
    return None


# ---------------------------------------------------------------------------
# Employment type inference
# ---------------------------------------------------------------------------

_EMPLOYMENT_TYPE_KEYWORDS: list[tuple[str, list[str]]] = [
    ("internship", ["praktikum", "praktikant", "internship", " intern "]),
    ("working_student", ["werkstudent", "working student"]),
    ("part_time", ["teilzeit", "part-time", "part time"]),
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

def infer_remote_type(location_raw: str, remote_hint=None) -> str:
    haystack = (location_raw or "").lower()
    if isinstance(remote_hint, bool) and remote_hint:
        haystack += " remote"
    elif isinstance(remote_hint, str):
        haystack += " " + remote_hint.lower()

    has_remote = "remote" in haystack or "homeoffice" in haystack or "home office" in haystack
    has_hybrid = "hybrid" in haystack
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
