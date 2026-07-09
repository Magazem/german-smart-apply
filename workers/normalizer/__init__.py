"""Normalization pipeline: turns raw source payloads into canonical `raw_jobs`
field values.

Reads either:
  - raw_job_snapshots rows from Postgres (via `run_normalizer`), or
  - a raw payload dict directly (via `build_raw_job_fields`), which is what
    every unit test uses so normalization logic never needs a live DB.
"""
