"""Near-duplicate clustering: catches postings that are almost certainly the
same real job but never shared an identical (resolved company, title,
location) key with anything else -- a reworded title, a description with
different boilerplate/formatting, gender-marker punctuation dedup.py's exact
key didn't normalize away, etc.

Deliberately does NOT compare across companies or across locations: two
different employers (or the same employer's genuinely different openings in
two cities) can easily share generic title/description boilerplate, and
wrongly merging those hides a real listing from a user, which is worse than
leaving a cosmetic near-duplicate unresolved (the same asymmetric-risk
argument as company_aliases -- see market_de.py's COMPANY_ALIASES comment).
So every comparison is scoped to (resolved company key, exact location) --
the same two axes exact dedup already trusts; only the title/description
match is now fuzzy instead of exact-string.

No external embedding API: per plan.md's own wording ("description
similarity and content fingerprints"), word-shingle Jaccard similarity is a
legitimate, dependency-free content fingerprint, so this feature needs no
real API key to be genuinely useful (mirrors the AI provider's mock-first
seam -- a real embedding model is a future upgrade path, not a blocker).
"""
from __future__ import annotations

import re
import uuid
from typing import Any

from common import db as db_module
from deduplicator import dedup as dedup_module

_WORD_RE = re.compile(r"[a-zäöüß0-9]+", re.IGNORECASE)

# Tunable, not yet validated against a large real corpus -- revisit once
# near-dup hits/misses can be sampled from production. Weighted toward
# description because two unrelated roles at the same company/location are
# far more likely to accidentally share a few title words than to share
# multi-word phrasing throughout the whole description.
TITLE_WEIGHT = 0.4
DESCRIPTION_WEIGHT = 0.6
SIMILARITY_THRESHOLD = 0.82
SHINGLE_SIZE = 3
# Below this many description tokens, shingle overlap is too noisy to trust
# (a couple of short, generic sentences can coincidentally share every
# shingle) -- treat as no signal rather than risk a false-positive merge.
MIN_DESCRIPTION_TOKENS = SHINGLE_SIZE + 2


def _tokenize(text: str) -> list[str]:
    return _WORD_RE.findall((text or "").lower())


def _shingles(text: str, n: int = SHINGLE_SIZE) -> set[str]:
    tokens = _tokenize(text)
    if len(tokens) < MIN_DESCRIPTION_TOKENS:
        return set()
    return {" ".join(tokens[i : i + n]) for i in range(len(tokens) - n + 1)}


def _jaccard(a: set[str], b: set[str]) -> float:
    if not a or not b:
        return 0.0
    intersection = len(a & b)
    union = len(a | b)
    return intersection / union if union else 0.0


def similarity(job_a: dict, job_b: dict) -> float:
    """Combined title + description similarity in [0, 1]. Falls back to
    title-only (at the same combined-score scale) when either description is
    too short to shingle meaningfully -- see MIN_DESCRIPTION_TOKENS.
    """
    title_sim = _jaccard(
        set(_tokenize(job_a["jobTitleNormalized"])), set(_tokenize(job_b["jobTitleNormalized"]))
    )
    # Deliberately job_a["jobDescriptionText"], not .get(..., "") -- a
    # missing key here previously (canonical_jobs has no description column
    # of its own; the caller must JOIN raw_jobs for it) silently degraded to
    # a title-only comparison instead of failing, and that's exactly the
    # class of bug worth surfacing loudly instead of masking.
    shingles_a = _shingles(job_a["jobDescriptionText"])
    shingles_b = _shingles(job_b["jobDescriptionText"])
    if not shingles_a or not shingles_b:
        return title_sim
    desc_sim = _jaccard(shingles_a, shingles_b)
    return TITLE_WEIGHT * title_sim + DESCRIPTION_WEIGHT * desc_sim


def _canonical_sort_key(job: dict):
    posted = job.get("postedAt") or job["crawledAt"]
    return (-job["sourceTrustScore"], posted, job["id"])


def run_near_duplicate_clustering(conn, country_code: str = "DE") -> dict[str, Any]:
    """Runs after run_dedup(). Idempotent across repeated invocations: only
    considers canonical_jobs still isVisible=true, and a merged-away loser
    stays isVisible=false forever, so it drops out of the candidate pool on
    every later run rather than being re-evaluated. Does not commit --
    caller owns the transaction boundary, same as run_dedup.

    Known simplification: each merge is a standalone pairwise event (its own
    duplicate_clusters row), not a single cluster growing across runs the
    way exact-dedup's clusterKey-keyed folding works -- a winner absorbing
    three near-dup losers over time ends up with three duplicate_clusters
    rows rather than one three-member cluster. Acceptable for Phase 2 scope;
    revisit if per-cluster reporting ever needs a single grouping.
    """
    dict_cur = db_module.dict_cursor(conn)
    dict_cur.execute(
        """
        SELECT cj.*, rj."jobDescriptionText" AS "jobDescriptionText"
        FROM "canonical_jobs" cj
        JOIN "raw_jobs" rj ON rj."id" = cj."rawJobId"
        WHERE cj."isVisible" = true AND cj."countryCode" = %s
        """,
        (country_code,),
    )
    candidates = dict_cur.fetchall()

    buckets: dict[tuple[str, str], list[dict]] = {}
    for job in candidates:
        company_key = dedup_module.resolve_company_key(dict_cur, job["companyNameNormalized"])
        buckets.setdefault((company_key, job["locationNormalized"]), []).append(job)

    cur = conn.cursor()
    clusters_created = 0
    members_created = 0
    jobs_hidden = 0

    for bucket_jobs in buckets.values():
        if len(bucket_jobs) < 2:
            continue
        ordered = sorted(bucket_jobs, key=_canonical_sort_key)
        hidden_ids: set[str] = set()

        for i, winner in enumerate(ordered):
            if winner["id"] in hidden_ids:
                continue
            for loser in ordered[i + 1 :]:
                if loser["id"] in hidden_ids:
                    continue
                score = similarity(winner, loser)
                if score < SIMILARITY_THRESHOLD:
                    continue

                cluster_id = str(uuid.uuid4())
                cur.execute(
                    'INSERT INTO "duplicate_clusters" ("id", "canonicalJobId", "clusterKey") '
                    'VALUES (%s, %s, %s)',
                    (cluster_id, winner["id"], f"near-dup:{winner['id']}:{loser['id']}"),
                )
                clusters_created += 1

                cur.execute(
                    """
                    INSERT INTO "duplicate_cluster_members"
                        ("id", "duplicateClusterId", "rawJobId", "similarityScore", "isCanonicalPick")
                    VALUES (%s, %s, %s, %s, %s)
                    """,
                    (str(uuid.uuid4()), cluster_id, winner["rawJobId"], 1.0, True),
                )
                cur.execute(
                    """
                    INSERT INTO "duplicate_cluster_members"
                        ("id", "duplicateClusterId", "rawJobId", "similarityScore", "isCanonicalPick")
                    VALUES (%s, %s, %s, %s, %s)
                    """,
                    (str(uuid.uuid4()), cluster_id, loser["rawJobId"], score, False),
                )
                members_created += 2

                cur.execute(
                    'UPDATE "canonical_jobs" SET "isVisible" = false WHERE "id" = %s', (loser["id"],)
                )
                # LEAST(), not a plain overwrite: duplicateConfidence should
                # only ever move toward "less certain" as more, potentially
                # weaker, near-dup merges get folded into the same winner.
                cur.execute(
                    'UPDATE "canonical_jobs" SET "duplicateConfidence" = LEAST("duplicateConfidence", %s) '
                    'WHERE "id" = %s',
                    (score, winner["id"]),
                )
                jobs_hidden += 1
                hidden_ids.add(loser["id"])

    return {
        "candidatesConsidered": len(candidates),
        "nearDuplicateClustersCreated": clusters_created,
        "nearDuplicateClusterMembersCreated": members_created,
        "jobsHidden": jobs_hidden,
    }
