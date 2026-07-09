"""Source ingestion adapters: one module per source type.

Every adapter exposes a `fetch(client, config) -> list[RawPayload]` function
(or a thin class wrapping it) that:
  1. Builds the request URL(s) from the source config.
  2. Runs each URL through `crawler.base.enforce_domain_allowlist` *before*
     ever calling the injected HTTP client -- this is the SSRF/governance
     guard described in plan.md's Source Ingestion Layer.
  3. Calls the injected client (never a module-level `requests.get`), so
     tests can supply a fake/mocked client and never touch the network.
  4. Returns plain dicts (RawPayload) ready to be written to raw_job_snapshots.
"""
