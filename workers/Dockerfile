FROM python:3.11-slim
WORKDIR /app/workers
# scripts/run_pipeline.py does `from common import db` etc. Running it as
# `python scripts/run_pipeline.py` only puts scripts/ (the script's own dir)
# on sys.path, not /app/workers, so those imports fail without this — pytest
# doesn't hit it because pyproject.toml's pythonpath = ["."] covers test runs.
ENV PYTHONPATH=/app/workers

COPY workers/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY workers/ .

# Phase 1: runs the full seed -> crawl -> normalize -> dedup pipeline once
# per container start/`docker compose run worker`. Production scheduling per
# source crawl_frequency_minutes (cron / a k8s CronJob per source) is a
# Phase 2+ concern - see plan.md's Source Ingestion Layer "Scheduler" bullet.
CMD ["python", "scripts/run_pipeline.py"]
