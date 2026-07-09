from __future__ import annotations

import json
from pathlib import Path

import pytest

from common import db
from crawler.seed import seed_sources
from deduplicator.seed import seed_company_aliases

FIXTURES_DIR = Path(__file__).parent / "fixtures"


def load_fixture(name: str) -> dict:
    with open(FIXTURES_DIR / name, encoding="utf-8") as f:
        return json.load(f)


@pytest.fixture
def pg_conn():
    """A real connection to the local Postgres instance, wrapped in a
    transaction that is always rolled back at teardown so tests never leave
    residue behind (and can be re-run indefinitely without unique-constraint
    conflicts). Every DB-touching function in this codebase takes a
    connection and never commits -- the test is the transaction boundary.
    """
    conn = db.connect()
    try:
        yield conn
    finally:
        conn.rollback()
        conn.close()


@pytest.fixture
def seeded_sources(pg_conn):
    """pg_conn with the 4 market-de sources seeded. Returns
    (conn, {logical_source_id: db_uuid}).
    """
    ids = seed_sources(pg_conn)
    return pg_conn, ids


@pytest.fixture
def seeded_db(seeded_sources):
    """seeded_sources plus company_aliases seeded from market-de."""
    conn, source_ids = seeded_sources
    seed_company_aliases(conn)
    return conn, source_ids
