"""Deduplication and Trust Layer.

- trust.py: sourceTrustScore (from trustTier) and scamRiskScore (market-de
  regex heuristics) computation.
- seed.py: seeds company_aliases from common.market_de.COMPANY_ALIASES.
- dedup.py: exact-dedup of raw_jobs into canonical_jobs, with a
  duplicate_clusters / duplicate_cluster_members audit trail for any raw_jobs
  collapsed together.
"""
