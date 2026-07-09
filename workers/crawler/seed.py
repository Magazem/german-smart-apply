"""Seed the `sources` table from common.market_de.SOURCES.

Idempotent: keyed on (sourceType, countryCode) since Phase 1's market-de pack
has exactly one source row per sourceType in Germany. Does not commit --
caller owns the transaction.
"""
from __future__ import annotations

import json
import uuid

from common import market_de


def seed_sources(conn, country_code: str = "DE") -> dict[str, str]:
    """Upsert every market_de.SOURCES entry. Returns a mapping of the market
    pack's logical sourceId (e.g. "greenhouse-de") -> the DB row's uuid `id`,
    since the two are different values (sources.id is a random uuid; the
    market pack's sourceId is a human-readable slug that isn't itself a
    column in the `sources` table).
    """
    cur = conn.cursor()
    ids: dict[str, str] = {}

    for src in market_de.SOURCES:
        cur.execute(
            'SELECT "id" FROM "sources" WHERE "sourceType" = %s AND "countryCode" = %s',
            (src["sourceType"], country_code),
        )
        row = cur.fetchone()
        if row:
            db_id = row[0]
            cur.execute(
                """
                UPDATE "sources"
                SET "displayName" = %s, "trustTier" = %s, "crawlFrequencyMinutes" = %s,
                    "config" = %s, "domainAllowlist" = %s, "updatedAt" = now()
                WHERE "id" = %s
                """,
                (
                    src["displayName"],
                    src["trustTier"],
                    src["crawlFrequencyMinutes"],
                    json.dumps(src["config"]),
                    src["domainAllowlist"],
                    db_id,
                ),
            )
        else:
            db_id = str(uuid.uuid4())
            cur.execute(
                """
                INSERT INTO "sources"
                    ("id", "sourceType", "displayName", "countryCode", "trustTier",
                     "crawlFrequencyMinutes", "config", "domainAllowlist", "updatedAt")
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, now())
                """,
                (
                    db_id,
                    src["sourceType"],
                    src["displayName"],
                    country_code,
                    src["trustTier"],
                    src["crawlFrequencyMinutes"],
                    json.dumps(src["config"]),
                    src["domainAllowlist"],
                ),
            )
        ids[src["sourceId"]] = db_id

    return ids
