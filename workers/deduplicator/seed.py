"""Seed company_aliases from common.market_de.COMPANY_ALIASES.

Both the canonical key and each alias are normalized through
normalizer.fields.normalize_company_name before being written, so lookups
during dedup (deduplicator.dedup.resolve_company_key) are consistent with how
every raw_jobs.companyNameNormalized value was produced. Self-mapping aliases
(where normalization already collapses the alias to the same key as the
canonical, e.g. "Zalando SE" -> "zalando" == canonical "zalando") are skipped
as no-ops.
"""
from __future__ import annotations

import uuid

from common import market_de
from normalizer.fields import normalize_company_name


def seed_company_aliases(conn) -> int:
    cur = conn.cursor()
    inserted = 0

    for canonical_raw, aliases in market_de.COMPANY_ALIASES.items():
        canonical_key = normalize_company_name(canonical_raw)
        for alias_raw in aliases:
            alias_key = normalize_company_name(alias_raw)
            if not alias_key or alias_key == canonical_key:
                continue
            cur.execute(
                """
                INSERT INTO "company_aliases" ("id", "companyNameNormalized", "alias", "aliasType")
                VALUES (%s, %s, %s, 'variant')
                ON CONFLICT ("companyNameNormalized", "alias") DO NOTHING
                """,
                (str(uuid.uuid4()), canonical_key, alias_key),
            )
            inserted += 1

    return inserted
