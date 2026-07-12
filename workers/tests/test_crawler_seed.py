"""Tests for crawler.seed.seed_sources: the (sourceType, countryCode)-keyed
upsert that provisions the `sources` table from common.market_de.SOURCES.

The `seeded_sources` fixture (tests/conftest.py) already calls seed_sources
once per test, exercising the insert path. What's untested anywhere else is
the *second* call in the same run -- the update-existing-row branch that
makes this function safe to call on every pipeline run (run_pipeline.py
calls it unconditionally, every time) rather than only on first setup.
"""
from __future__ import annotations

from crawler.seed import seed_sources


def test_seed_sources_is_idempotent_and_returns_stable_ids(pg_conn):
    first_ids = seed_sources(pg_conn)
    second_ids = seed_sources(pg_conn)

    assert second_ids == first_ids  # same logical sourceId -> same DB uuid both times

    cur = pg_conn.cursor()
    cur.execute('SELECT COUNT(*) FROM "sources"')
    assert cur.fetchone()[0] == len(first_ids)  # no duplicate rows from the second call


def test_seed_sources_resyncs_fields_on_the_existing_row(pg_conn):
    """The second call isn't a no-op once a row exists -- it must re-sync
    displayName/trustTier/config/domainAllowlist to whatever market_de
    currently declares, so a source's config can be corrected centrally in
    market_de.py and take effect on the next pipeline run without a manual
    DB fix-up.
    """
    ids = seed_sources(pg_conn)
    source_id = ids["greenhouse-de"]

    cur = pg_conn.cursor()
    cur.execute('UPDATE "sources" SET "displayName" = %s, "trustTier" = %s WHERE "id" = %s', ("Mangled Name", "low", source_id))

    seed_sources(pg_conn)

    cur.execute('SELECT "displayName", "trustTier" FROM "sources" WHERE "id" = %s', (source_id,))
    display_name, trust_tier = cur.fetchone()
    assert display_name == "Greenhouse (DE companies)"
    assert trust_tier == "high"
