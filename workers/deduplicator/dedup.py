"""Exact deduplication: raw_jobs -> canonical_jobs, with duplicate_clusters /
duplicate_cluster_members written for every cluster key ever seen (not just
ones with 2+ members in a single run - see the module-level note below on
why that matters).

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

Cross-run duplicates: sources crawl on independent schedules
(crawlFrequencyMinutes), so two exact-duplicate postings from different
sources routinely arrive in *separate* run_dedup() invocations, not the same
one. A `duplicate_clusters` row is therefore created for every cluster key
the very first time it's seen -- even a "cluster of one" -- so a later run
can look it up by clusterKey and fold a newly-arrived duplicate into the
existing canonical_jobs row (re-evaluating the canonical pick across *all*
members, old and new) instead of minting a second, uncollapsed canonical_jobs
row for what is really the same posting.
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

        # A cluster for this key may already exist from an earlier run (see
        # module docstring) - if so, fold this batch's job(s) into it instead
        # of minting a second canonical_jobs row for the same real posting.
        dict_cur.execute(
            'SELECT * FROM "duplicate_clusters" WHERE "clusterKey" = %s LIMIT 1', (cluster_key,)
        )
        existing_cluster = dict_cur.fetchone()

        if existing_cluster is not None:
            duplicate_cluster_id = existing_cluster["id"]
            canonical_id = existing_cluster["canonicalJobId"]
            dict_cur.execute(
                """
                SELECT rj.* FROM "duplicate_cluster_members" dcm
                JOIN "raw_jobs" rj ON rj."id" = dcm."rawJobId"
                WHERE dcm."duplicateClusterId" = %s
                """,
                (duplicate_cluster_id,),
            )
            all_jobs_in_cluster = dict_cur.fetchall() + jobs
        else:
            duplicate_cluster_id = str(uuid.uuid4())
            canonical_id = str(uuid.uuid4())
            all_jobs_in_cluster = jobs

        # Re-evaluate the canonical pick across every member the cluster has
        # ever had, old and new - a later, higher-trust duplicate can promote
        # over an earlier, lower-trust one.
        ordered = sorted(all_jobs_in_cluster, key=_canonical_sort_key)
        canonical_pick = ordered[0]
        # Exact-match cluster members all share identical normalized keys, so
        # duplicateConfidence on the canonical_jobs row is 1.0 regardless of
        # cluster size (this is an *exact* dedup pass, not similarity-based).
        duplicate_confidence = 1.0

        canonical_fields = (
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
        )

        if existing_cluster is not None:
            cur.execute(
                """
                UPDATE "canonical_jobs" SET
                    "rawJobId" = %s, "companyNameNormalized" = %s, "jobTitleNormalized" = %s,
                    "locationNormalized" = %s, "countryCode" = %s, "remoteType" = %s,
                    "employmentType" = %s, "seniority" = %s, "salaryMin" = %s, "salaryMax" = %s,
                    "salaryCurrency" = %s, "techStackTags" = %s, "language" = %s,
                    "sourceTrustScore" = %s, "scamRiskScore" = %s, "duplicateConfidence" = %s,
                    "postedAt" = %s, "crawledAt" = %s, "updatedAt" = now()
                WHERE "id" = %s
                """,
                (canonical_pick["id"], *canonical_fields, canonical_id),
            )
        else:
            cur.execute(
                """
                INSERT INTO "canonical_jobs" (
                    "id", "rawJobId", "companyNameNormalized", "jobTitleNormalized", "locationNormalized",
                    "countryCode", "remoteType", "employmentType", "seniority", "salaryMin", "salaryMax",
                    "salaryCurrency", "techStackTags", "language", "sourceTrustScore", "scamRiskScore",
                    "duplicateConfidence", "postedAt", "crawledAt", "updatedAt"
                ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, now())
                """,
                (canonical_id, canonical_pick["id"], *canonical_fields),
            )
            canonical_created += 1

            cur.execute(
                'INSERT INTO "duplicate_clusters" ("id", "canonicalJobId", "clusterKey") VALUES (%s, %s, %s)',
                (duplicate_cluster_id, canonical_id, cluster_key),
            )
            clusters_created += 1

        # Cluster-membership rows only need inserting for jobs newly arrived
        # in *this* batch - a prior run's members already have rows. The
        # canonical-pick flag is refreshed across the whole cluster since a
        # newly-arrived job may have just been promoted above.
        cur.execute(
            'UPDATE "duplicate_cluster_members" SET "isCanonicalPick" = false '
            'WHERE "duplicateClusterId" = %s',
            (duplicate_cluster_id,),
        )
        for job in jobs:
            cur.execute(
                """
                INSERT INTO "duplicate_cluster_members"
                    ("id", "duplicateClusterId", "rawJobId", "similarityScore", "isCanonicalPick")
                VALUES (%s, %s, %s, %s, %s)
                """,
                (str(uuid.uuid4()), duplicate_cluster_id, job["id"], 1.0, False),
            )
            members_created += 1
        cur.execute(
            'UPDATE "duplicate_cluster_members" SET "isCanonicalPick" = true '
            'WHERE "duplicateClusterId" = %s AND "rawJobId" = %s',
            (duplicate_cluster_id, canonical_pick["id"]),
        )

        for job in jobs:
            cur.execute('UPDATE "raw_jobs" SET "isDeduplicated" = true WHERE "id" = %s', (job["id"],))

    return {
        "groups": len(groups),
        "rawJobsProcessed": len(raw_jobs),
        "canonicalJobsCreated": canonical_created,
        "duplicateClustersCreated": clusters_created,
        "duplicateClusterMembersCreated": members_created,
    }
