"""Exact deduplication: raw_jobs -> canonical_jobs, with duplicate_clusters /
duplicate_cluster_members written for any raw_jobs collapsed together.

Exact-dedup key = (resolved company key, jobTitleNormalized, locationNormalized).
"Resolved company key" means companyNameNormalized after resolving through
company_aliases (so "SAP AG" and "SAP Deutschland" collapse to the same
company as "SAP SE" even though generic suffix-stripping alone wouldn't unify
them). This mirrors plan.md's "Exact deduplication using company + title +
location + stable identifiers" -- the stable identifier here is the resolved
company key + normalized title + normalized location tuple itself, since a
single job re-posted under two ATS sources will have identical values for all
three after normalization, while two genuinely different roles will not.

Within a cluster, the canonical pick is the raw_job with the highest
sourceTrustScore, tie-broken by earliest postedAt (falling back to crawledAt),
then by id for full determinism.
"""
from __future__ import annotations

import hashlib
import uuid
from typing import Any

from common import db as db_module
from deduplicator import trust


def resolve_company_key(cur, company_name_normalized: str) -> str:
    """Look up an alias -> canonical companyNameNormalized mapping. Returns
    the input unchanged if no alias row matches (i.e. it's already canonical,
    or simply has no known alias).
    """
    cur.execute(
        'SELECT "companyNameNormalized" FROM "company_aliases" WHERE "alias" = %s LIMIT 1',
        (company_name_normalized,),
    )
    row = cur.fetchone()
    if row:
        return row["companyNameNormalized"]
    return company_name_normalized


def compute_cluster_key(company_key: str, title_normalized: str, location_normalized: str) -> str:
    raw = "|".join([company_key, title_normalized, location_normalized])
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()


def fetch_undeduplicated_raw_jobs(cur, country_code: str = "DE") -> list[dict]:
    cur.execute(
        """
        SELECT rj.*, s."trustTier" AS "sourceTrustTier"
        FROM "raw_jobs" rj
        JOIN "sources" s ON s."id" = rj."sourceId"
        WHERE rj."isDeduplicated" = false AND rj."countryCode" = %s
        ORDER BY rj."crawledAt" ASC, rj."id" ASC
        """,
        (country_code,),
    )
    return cur.fetchall()


def _canonical_sort_key(job: dict):
    posted = job.get("postedAt") or job["crawledAt"]
    return (-job["sourceTrustScore"], posted, job["id"])


def run_dedup(conn, country_code: str = "DE") -> dict[str, Any]:
    """Process every not-yet-deduplicated raw_job for `country_code`.

    Does not commit -- caller owns the transaction boundary.
    """
    dict_cur = db_module.dict_cursor(conn)
    raw_jobs = fetch_undeduplicated_raw_jobs(dict_cur, country_code)

    groups: dict[str, list[dict]] = {}
    for job in raw_jobs:
        company_key = resolve_company_key(dict_cur, job["companyNameNormalized"])
        key = compute_cluster_key(company_key, job["jobTitleNormalized"], job["locationNormalized"])
        groups.setdefault(key, []).append(job)

    cur = conn.cursor()
    canonical_created = 0
    clusters_created = 0
    members_created = 0

    for cluster_key, jobs in groups.items():
        for job in jobs:
            trust_score = trust.trust_score_for_tier(job["sourceTrustTier"])
            scam_score = trust.compute_scam_risk_score(
                job["jobDescriptionText"], job["applyUrl"], job["sourceUrl"]
            )
            cur.execute(
                'UPDATE "raw_jobs" SET "sourceTrustScore" = %s, "scamRiskScore" = %s WHERE "id" = %s',
                (trust_score, scam_score, job["id"]),
            )
            job["sourceTrustScore"] = trust_score
            job["scamRiskScore"] = scam_score

        ordered = sorted(jobs, key=_canonical_sort_key)
        canonical_pick = ordered[0]
        # Exact-match cluster members all share identical normalized keys, so
        # duplicateConfidence on the canonical_jobs row is 1.0 regardless of
        # cluster size (this is an *exact* dedup pass, not similarity-based).
        duplicate_confidence = 1.0

        canonical_id = str(uuid.uuid4())
        cur.execute(
            """
            INSERT INTO "canonical_jobs" (
                "id", "rawJobId", "companyNameNormalized", "jobTitleNormalized", "locationNormalized",
                "countryCode", "remoteType", "employmentType", "seniority", "salaryMin", "salaryMax",
                "salaryCurrency", "techStackTags", "language", "sourceTrustScore", "scamRiskScore",
                "duplicateConfidence", "postedAt", "crawledAt", "updatedAt"
            ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, now())
            """,
            (
                canonical_id,
                canonical_pick["id"],
                canonical_pick["companyNameNormalized"],
                canonical_pick["jobTitleNormalized"],
                canonical_pick["locationNormalized"],
                canonical_pick["countryCode"],
                canonical_pick["remoteType"],
                canonical_pick["employmentType"],
                canonical_pick["seniority"],
                canonical_pick["salaryMin"],
                canonical_pick["salaryMax"],
                canonical_pick["salaryCurrency"],
                canonical_pick["techStackTags"],
                canonical_pick["language"],
                canonical_pick["sourceTrustScore"],
                canonical_pick["scamRiskScore"],
                duplicate_confidence,
                canonical_pick["postedAt"],
                canonical_pick["crawledAt"],
            ),
        )
        canonical_created += 1

        if len(jobs) > 1:
            duplicate_cluster_id = str(uuid.uuid4())
            cur.execute(
                'INSERT INTO "duplicate_clusters" ("id", "canonicalJobId", "clusterKey") VALUES (%s, %s, %s)',
                (duplicate_cluster_id, canonical_id, cluster_key),
            )
            clusters_created += 1
            for job in ordered:
                cur.execute(
                    """
                    INSERT INTO "duplicate_cluster_members"
                        ("id", "duplicateClusterId", "rawJobId", "similarityScore", "isCanonicalPick")
                    VALUES (%s, %s, %s, %s, %s)
                    """,
                    (
                        str(uuid.uuid4()),
                        duplicate_cluster_id,
                        job["id"],
                        1.0,  # exact-match cluster
                        job["id"] == canonical_pick["id"],
                    ),
                )
                members_created += 1

        for job in jobs:
            cur.execute('UPDATE "raw_jobs" SET "isDeduplicated" = true WHERE "id" = %s', (job["id"],))

    return {
        "groups": len(groups),
        "rawJobsProcessed": len(raw_jobs),
        "canonicalJobsCreated": canonical_created,
        "duplicateClustersCreated": clusters_created,
        "duplicateClusterMembersCreated": members_created,
    }
