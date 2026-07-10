"""Unit tests for each field-level normalization transform in normalizer/fields.py.
Pure functions -- no DB, no network.
"""
from __future__ import annotations

import pytest

from common.market_de import LOCATION_DICTIONARY
from normalizer import fields


# ---------------------------------------------------------------------------
# Company name normalization
# ---------------------------------------------------------------------------

@pytest.mark.parametrize(
    "raw,expected",
    [
        ("Acme GmbH", "acme"),
        ("Acme GmbH & Co. KG", "acme"),
        ("SAP SE", "sap"),
        ("SAP AG", "sap"),
        ("SAP Deutschland", "sap deutschland"),
        ("Zalando SE", "zalando"),
        ("Some Startup Inc.", "some startup"),
        ("Bosch", "bosch"),
        ("", ""),
    ],
)
def test_normalize_company_name(raw, expected):
    assert fields.normalize_company_name(raw) == expected


# ---------------------------------------------------------------------------
# Job title normalization
# ---------------------------------------------------------------------------

def test_normalize_job_title_strips_gender_marker():
    assert fields.normalize_job_title("Senior Backend Engineer (m/w/d)") == "senior backend engineer"
    assert fields.normalize_job_title("Senior Backend Engineer") == "senior backend engineer"


def test_normalize_job_title_strips_gender_star():
    assert fields.normalize_job_title("Entwickler*in") == "entwickler"


def test_normalize_job_title_strips_mwdx_variant():
    assert fields.normalize_job_title("Senior Backend Engineer (m/w/d/x)") == "senior backend engineer"


def test_normalize_job_title_strips_colon_and_underscore_gendersternchen():
    assert fields.normalize_job_title("Senior Entwickler:in") == "senior entwickler"
    assert fields.normalize_job_title("Senior Entwickler_in") == "senior entwickler"


def test_normalize_job_title_gender_marker_variants_all_collapse_to_the_same_title():
    variants = [
        "Senior Entwickler (m/w/d)",
        "Senior Entwickler (m/w/d/x)",
        "Senior Entwickler*in",
        "Senior Entwickler:in",
        "Senior Entwickler_in",
    ]
    normalized = {fields.normalize_job_title(v) for v in variants}
    assert normalized == {"senior entwickler"}


def test_normalize_job_title_collapses_whitespace_and_case():
    assert fields.normalize_job_title("  Senior   Backend  Engineer  ") == "senior backend engineer"


def test_normalize_job_title_empty():
    assert fields.normalize_job_title("") == ""


# ---------------------------------------------------------------------------
# Location normalization
# ---------------------------------------------------------------------------

def test_normalize_location_direct_dictionary_hit():
    assert fields.normalize_location("Berlin", LOCATION_DICTIONARY) == ("Berlin", "DE")
    assert fields.normalize_location("münchen", LOCATION_DICTIONARY) == ("Munich", "DE")


def test_normalize_location_multi_value_string_picks_first_match():
    assert fields.normalize_location("Berlin, Germany", LOCATION_DICTIONARY) == ("Berlin", "DE")


def test_normalize_location_remote_variants():
    assert fields.normalize_location("Remote", LOCATION_DICTIONARY) == ("Remote", "DE")
    assert fields.normalize_location("Homeoffice", LOCATION_DICTIONARY) == ("Remote", "DE")


def test_normalize_location_unknown_falls_back_to_title_case():
    assert fields.normalize_location("someobscuretown", LOCATION_DICTIONARY) == ("Someobscuretown", "DE")


def test_normalize_location_empty_string():
    assert fields.normalize_location("", LOCATION_DICTIONARY) == ("Unknown", "DE")


# ---------------------------------------------------------------------------
# Salary parsing (German `.` thousands / `,` decimal conventions)
# ---------------------------------------------------------------------------

def test_parse_salary_range_with_trailing_currency_symbol():
    assert fields.parse_salary("Gehalt: 65.000 - 80.000 €") == (65000, 80000, "EUR")


def test_parse_salary_single_value_with_eur_suffix():
    assert fields.parse_salary("Salary: 55.000 EUR annually") == (55000, 55000, "EUR")


def test_parse_salary_handles_decimal_comma():
    assert fields.parse_salary("Ab 65.000,50 € brutto pro Jahr") == (65000, 65000, "EUR")


def test_parse_salary_range_with_bis_keyword():
    assert fields.parse_salary("Verguetung 50.000 bis 60.000 EUR") == (50000, 60000, "EUR")


def test_parse_salary_range_with_und_keyword():
    assert fields.parse_salary("Gehalt zwischen 45.000 und 55.000 Euro") == (45000, 55000, "EUR")


def test_parse_salary_returns_none_without_currency_marker():
    # Plenty of numbers here, but none of them are a salary -- no €/EUR marker.
    assert fields.parse_salary("We are a team of 500 people, 40 hours per week") == (None, None, None)


def test_parse_salary_ignores_earlier_currency_less_numbers_and_finds_real_salary():
    text = "Call us at 0151-2345678 for questions. Salary range: 45.000 - 55.000 EUR."
    assert fields.parse_salary(text) == (45000, 55000, "EUR")


def test_parse_salary_empty_text():
    assert fields.parse_salary("") == (None, None, None)


# ---------------------------------------------------------------------------
# Language detection
# ---------------------------------------------------------------------------

def test_detect_language_german():
    text = (
        "Wir suchen einen erfahrenen Softwareentwickler mit Kenntnissen in Python. "
        "Ihre Aufgaben umfassen die Entwicklung und das Testen unserer Anwendungen fuer unser Team."
    )
    assert fields.detect_language(text) == "de"


def test_detect_language_english():
    text = (
        "We are looking for an experienced software engineer with Python skills. "
        "Your responsibilities include developing and testing our applications for our growing team."
    )
    assert fields.detect_language(text) == "en"


def test_detect_language_empty_defaults_to_english():
    assert fields.detect_language("") == "en"


# ---------------------------------------------------------------------------
# Seniority inference
# ---------------------------------------------------------------------------

@pytest.mark.parametrize(
    "title,expected",
    [
        ("Junior Software Engineer", "junior"),
        ("Senior Backend Developer", "senior"),
        ("Engineering Team Lead", "lead"),
        ("Principal Architect", "principal"),
        ("Head of Engineering", "principal"),
        ("Praktikant Marketing", "intern"),
        ("Berufseinsteiger Consultant", "junior"),
        ("Software Engineer", None),
        ("Senior Lead Engineer", "lead"),  # more-senior keyword wins when both present
    ],
)
def test_infer_seniority(title, expected):
    assert fields.infer_seniority(title) == expected


# ---------------------------------------------------------------------------
# Employment type inference
# ---------------------------------------------------------------------------

def test_infer_employment_type_working_student():
    assert fields.infer_employment_type("Werkstudent Marketing (m/w/d)") == "working_student"


def test_infer_employment_type_internship():
    assert fields.infer_employment_type("Praktikum im Bereich Data Science") == "internship"


def test_infer_employment_type_part_time():
    assert fields.infer_employment_type("Sales Manager - Teilzeit") == "part_time"


def test_infer_employment_type_defaults_full_time():
    assert fields.infer_employment_type("Senior Backend Engineer") == "full_time"


def test_infer_employment_type_honors_enum_convention_hint():
    # Structured source fields (e.g. Stepstone's employmentType) pass their
    # own enum value straight through as `hint`, using the same underscore
    # convention this function's own output uses - not natural-language text.
    assert fields.infer_employment_type("Sales Manager", "General sales role.", hint="part_time") == "part_time"
    assert (
        fields.infer_employment_type("Marketing Assistant", "General role.", hint="working_student")
        == "working_student"
    )


# ---------------------------------------------------------------------------
# Remote-type inference
# ---------------------------------------------------------------------------

def test_infer_remote_type_remote_location():
    assert fields.infer_remote_type("Remote") == "remote"


def test_infer_remote_type_hybrid_keyword():
    assert fields.infer_remote_type("Berlin (Hybrid)") == "hybrid"


def test_infer_remote_type_defaults_onsite():
    assert fields.infer_remote_type("Berlin") == "onsite"


def test_infer_remote_type_from_bool_hint():
    assert fields.infer_remote_type("Berlin", remote_hint=True) == "remote"


# ---------------------------------------------------------------------------
# Tech-stack tag extraction
# ---------------------------------------------------------------------------

def test_extract_tech_stack_tags_finds_known_keywords():
    tags = fields.extract_tech_stack_tags(
        "Senior Python Engineer",
        "You will work with Python, AWS, Docker, Kubernetes and PostgreSQL daily.",
    )
    assert set(tags) == {"python", "aws", "docker", "kubernetes", "postgresql"}


def test_extract_tech_stack_tags_no_false_positive_substrings():
    # "java" should not match inside "javascript" spuriously counted twice,
    # and unrelated words shouldn't trigger unrelated tags.
    tags = fields.extract_tech_stack_tags("Javascript Developer", "We use JavaScript daily, no Java here.")
    assert "javascript" in tags
    assert "java" in tags  # "Java" does appear as its own word in "no Java here"


def test_extract_tech_stack_tags_empty_description():
    assert fields.extract_tech_stack_tags("", "") == []
